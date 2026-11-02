# Musafir Cafe — ZATCA FATOORA integration

## Current implementation status

This repository contains the authenticated Firebase Functions API adapter in `functions/index.js`.
It is **not yet a production-ready EGS**: the POS does not yet generate ZATCA-compliant UBL 2.1 XML, calculate the ZATCA invoice hash/PIH chain, create the required XAdES/ECDSA signature, or generate the Integration Phase TLV QR. Do not enable Production submission until these are implemented and the generated invoices pass the official ZATCA Compliance and Enablement Toolbox (SDK) and FATOORA onboarding checks.

## Existing Musafir POS data locations

- POS settings: `users/{uid}/pos/settings` (the POS writes its settings object here).
- POS sales: `users/{uid}/sales/s{saleNo}` (the POS writes completed sales here).
- POS sale fields include `no`, `sn`, `t`, `items[]`, `sub`, `disc`, `tax`, `total`, `pays[]`, and `src`.
- The adapter's ZATCA seller profile is currently read from `users/{uid}/pos/settings` under `zatca`.

Required `zatca` profile fields:
`enabled`, `sellerName`, `vatNumber`, `street`, `building`, `district`, `city`, `postalCode`.
VAT format validation is a format check only; it does not validate the taxpayer's registration with ZATCA.

## Firebase Secret Manager

Create secrets without committing values to Git:

- `ZATCA_SANDBOX_TOKEN` — sandbox test Production CSID binary security token.
- `ZATCA_SANDBOX_SECRET` — matching sandbox secret.
- `ZATCA_PROD_TOKEN` — Production CSID binary security token.
- `ZATCA_PROD_SECRET` — matching Production CSID secret.

Never store private keys, CSID secrets, OTPs, or credentials in browser code, Firestore profile documents, GitHub, or chat messages. Private signing keys must be protected in an appropriate key store/HSM and must never be sent to the browser.

## API environments

- Sandbox base: `https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation`
- Production base: `https://gw-fatoora.zatca.gov.sa/e-invoicing/core`
- API version header: `Accept-Version: V2`

Configure the callable Functions environment with `ZATCA_ENVIRONMENT=sandbox` for development. The optional `ZATCA_API_BASE_URL` override is restricted to the official ZATCA gateway hostname.

## Current callable Functions

- `zatcaCheckSetup`: authenticated seller-profile completeness check.
- `zatcaStatus`: environment and secret-presence status; does not validate CSID against ZATCA.
- `zatcaCheckCredentials`: confirms secrets are mounted; it is not a gateway network test.
- `zatcaSubmitInvoice`: accepts an already signed UBL XML payload, UUID, SHA-256 invoice hash, and `documentType`; routes Standard to Clearance and Simplified to Reporting. It is not an invoice generator or signer. Before sending, transport validation enforces canonical Base64, a 1 MiB decoded-size limit, valid UTF-8, a UBL Invoice root, a matching XML UUID, a 32-byte Base64 SHA-256 value, and rejects DTD/ENTITY declarations. These checks do **not** validate UBL schema, the ZATCA invoice-hash algorithm, XAdES signatures, QR content, or SDK compliance.

## Required EGS work before any live submission

1. Confirm seller legal name, VAT number, registered address, branch/location and applicable VAT treatment with the taxpayer.
2. Decide the EGS Functionality Map for Standard and Simplified documents, then generate a compliant CSR and keep its private key secure.
3. Complete FATOORA OTP/CSR Compliance CSID onboarding, compliance invoice checks, and Production CSID issuance.
4. Implement UBL 2.1 XML generation from the real POS sale record, including invoice UUID, issue date/time, seller/buyer data, VAT categories/rates, tax totals, monetary totals, invoice lines, and required document references.
5. Implement the ZATCA-prescribed invoice hash/PIH chain, ECDSA/XAdES signing and TLV QR according to the current official Security Features Implementation Standards.
6. Validate XML and QR using the official ZATCA SDK and complete sandbox API tests.
7. Wire the EGS pipeline to the POS checkout and store the original XML, hash, QR, clearance/reporting response and status against the sale. Ensure retry/idempotency, credit/debit notes, refunds, and offline queued sales are handled without duplicate issuance. If a gateway timeout or server-side 5xx leaves acceptance ambiguous, the invoice is marked `submission_unknown` and automatic retry for that UUID is blocked pending manual reconciliation.
8. Only after a successful taxpayer onboarding and end-to-end verification, set both deployment-only flags `ZATCA_PRODUCTION_ENABLED=true` and `ZATCA_PRODUCTION_CSID_VERIFIED=true`, set `ZATCA_ENVIRONMENT=production`, and deploy.

## Deployment

From the repository root, install dependencies in `functions`, configure Secret Manager values in the Firebase project, then deploy the `zatca` Functions codebase. Do not run a Production deploy or enable Production flags as part of routine development.

## Official references

- https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx
- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
- https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf

## Automatic POS sale intake (new)

A Firestore `onDocumentCreated` trigger watches `users/{uid}/sales/{saleId}` and creates one idempotent work record at `users/{uid}/zatcaInvoices/sale-{saleId}`. This catches signed-in POS sales and sales uploaded later after offline use. It does not change checkout behavior or send anything to ZATCA.

The queue assesses seller-profile completeness, invoice-line validity, refund status, POS currency and tax amount. Current states include:
- `blocked_profile`: seller profile is incomplete or disabled.
- `manual_review`: sale data is not suitable for invoice creation.
- `credit_note_required`: refund needs a separate compliant credit-note workflow.
- `awaiting_egs_review`: sale is recorded, but currency/tax/document classification or the EGS pipeline needs review.

The signed-in submit endpoint also uses `submission_unknown` when a request may have reached the gateway but no definitive response was received. Do not reset this state or retry the UUID until the gateway outcome has been reconciled.

**Important:** every transaction must be classified as Standard or Simplified from its buyer and transaction details. A global default alone is not sufficient. The existing POS currently has no verified buyer VAT-number/address capture or compliant invoice generator, so queued records intentionally remain in review and are not automatically submitted.

The built-in Node test suite is `npm test` in `functions/` and uses `node --test`.
