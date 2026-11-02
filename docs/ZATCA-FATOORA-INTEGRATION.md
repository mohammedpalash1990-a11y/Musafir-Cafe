# Musafir Cafe — ZATCA FATOORA integration

## Current implementation status

The current main branch includes the Saudi Global VAT setting (15% VAT-inclusive pricing) and the EGS foundation: UBL 2.1 XML construction, SHA-256 invoice hashing, ECDSA/XAdES construction, TLV QR generation, ICV/PIH sequencing, OTP/CSID onboarding, and sandbox-only invoice generation/submission callables. The generated-invoice path verifies the EGS private key against the CSID certificate and signs the raw 32-byte invoice digest (not a second hash).

**This is still not certified or production-ready.** The generated XML/hash/XAdES/QR have not yet been validated against the current official ZATCA SDK, and no taxpayer-owned sandbox E2E submission or Production CSID verification has been performed. The POS checkout/offline queue is not yet fully wired to automatically generate and submit invoices. Keep Production disabled.

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

Never store private keys, CSID secrets, OTPs, or credentials in browser code, Firestore profile documents, GitHub, or chat messages. Buyer VAT/address details are business personal data: verify that deployed Firestore Security Rules restrict `users/{uid}/sales` and `users/{uid}/zatcaInvoices` to the authenticated owner and trusted server functions. No Firestore rules file was found in this repository during this change, so deployed rule enforcement has not been audited. Private signing keys must be protected in an appropriate key store/HSM and must never be sent to the browser.

## API environments

- Sandbox base: `https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation`
- Production base: `https://gw-fatoora.zatca.gov.sa/e-invoicing/core`
- API version header: `Accept-Version: V2`

Configure the callable Functions environment with `ZATCA_ENVIRONMENT=sandbox` for development. The optional `ZATCA_API_BASE_URL` override is restricted to the official ZATCA gateway hostname.

## Current callable Functions

- `zatcaCheckSetup`: authenticated seller-profile completeness check.
- `zatcaStatus`: environment and secret-presence status; does not validate CSID against ZATCA.
- `zatcaCheckCredentials`: confirms configured Secret Manager values; it is not a gateway network test.
- `zatcaRequestComplianceCsid`, `zatcaSubmitComplianceInvoice`, `zatcaRequestProductionCsid`: sandbox-only OTP/CSID onboarding and compliance scenario workflow; credentials are encrypted at rest.
- `zatcaGenerateInvoice`: sandbox-only invoice generation from an existing POS sale, including ICV/PIH, UBL XML, ECDSA/XAdES and TLV QR. Requires the CSR-matching `ZATCA_EGS_PRIVATE_KEY` Secret Manager secret and a sandbox Production CSID from onboarding.
- `zatcaGetGeneratedInvoice`: returns the generated XML to the authenticated tenant for official SDK validation.
- `zatcaSubmitGeneratedInvoice`: explicit sandbox Reporting/Clearance submission of a previously generated invoice, with idempotency and ambiguous-outcome protection.
- `zatcaSubmitInvoice`: legacy transport adapter for already signed UBL XML. Transport validation enforces canonical Base64, a 1 MiB decoded-size limit, valid UTF-8, a UBL Invoice root, a matching XML UUID, a 32-byte Base64 SHA-256 value, and rejects DTD/ENTITY declarations. These checks do **not** validate UBL schema or official SDK compliance.

## Required work before any live submission

1. Confirm seller legal name, VAT number, registered address, branch/location and applicable VAT treatment with the taxpayer.
2. Generate the EGS CSR/private key using the current official ZATCA CSR profile; keep the matching private key in Secret Manager or an HSM and verify it matches the CSID certificate.
3. Run the official ZATCA SDK against representative Simplified and Standard invoices, credit/debit notes, XML hashes, signatures, and QR payloads. Resolve every error and warning before proceeding.
4. Complete taxpayer-owned sandbox OTP/CSID onboarding and end-to-end Reporting/Clearance submissions. Verify actual FATOORA responses, request IDs, and reconciliation behavior.
5. Wire invoice generation/submission into the POS UI and offline sync queue without breaking existing checkout, inventory, due, reporting, or sales records. Add safe retry/reconciliation UI for `submission_unknown` and `submitted` outcomes.
6. Complete credit/debit note and refund mapping, per-EGS device sequencing, backup/restore handling, and audit logs. The current invoice builder supports Standard-rated 15% lines only.
7. Audit deployed Firestore rules and access controls for sales, buyer data, invoice XML, onboarding records and encrypted credentials.
8. Only after official SDK validation, taxpayer Production CSID issuance, and end-to-end verification, set `ZATCA_PRODUCTION_ENABLED=true` and `ZATCA_PRODUCTION_CSID_VERIFIED=true`, set `ZATCA_ENVIRONMENT=production`, and deploy.

## Deployment

From the repository root, install dependencies in `functions`, configure Secret Manager values in the Firebase project, then deploy the `zatca` Functions codebase. Do not run a Production deploy or enable Production flags as part of routine development.

## Official references

- https://zatca.gov.sa/en/E-Invoicing/Pages/default.aspx
- https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
- https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf

## Automatic POS sale intake (new)

A Firestore `onDocumentCreated` trigger watches `users/{uid}/sales/{saleId}` and creates one idempotent work record at `users/{uid}/zatcaInvoices/sale-{saleId}`. This catches signed-in POS sales and sales uploaded later after offline use. It does not change checkout behavior or send anything to ZATCA.

The queue assesses seller-profile completeness, invoice-line validity, refund status, POS currency, line-level VAT metadata and POS arithmetic reconciliation. The POS product editor now captures a ZATCA VAT category (`S`, `Z`, `E`, or `O`) and rate per product, and copies those values into each new sale line. Existing products remain unclassified until the seller explicitly configures them. The POS's displayed VAT amount is still calculated using its existing global tax setting; the queue only accepts the line metadata when its calculated VAT reconciles to that stored amount. This is a safety check, not a full tax-engine replacement. Menu categories such as Drinks/Food must never be treated as VAT categories. The queue checks line extension amounts against subtotal, subtotal minus discount plus VAT against total, and the VAT computed from each line's category/rate against the stored POS VAT total (0.02 SAR tolerance). Standard-rated lines require a positive rate; zero-rated, exempt and out-of-scope lines require zero rate. Combo products currently have no tax breakdown and remain blocked for manual review. Current states include:
- `blocked_profile`: seller profile is incomplete or disabled.
- `manual_review`: sale data is not suitable for invoice creation.
- `credit_note_required`: refund needs a separate compliant credit-note workflow.
- `awaiting_egs_review`: sale is recorded, but currency/tax/document classification or the EGS pipeline needs review.

The signed-in submit endpoint also uses `submission_unknown` when a request may have reached the gateway but no definitive response was received. Do not reset this state or retry the UUID until the gateway outcome has been reconciled.

**Important:** every transaction must be classified as Standard or Simplified from its buyer and transaction details. A global default alone is not sufficient. The POS checkout now records the invoice type per transaction. Standard (B2B) selection requires buyer legal name, Saudi VAT number and address fields; the queue validates their presence and VAT-number format. Buyer details remain on the source sale record and are not duplicated into the ZATCA queue. The cashier must explicitly choose Standard or Simplified for every sale; there is no preselected document type. This is data capture and preflight only; it does not determine legal classification automatically. The POS still has no compliant invoice generator, so queued records intentionally remain in review and are not automatically submitted.

The built-in Node test suite is `npm test` in `functions/` and uses `node --test`.
