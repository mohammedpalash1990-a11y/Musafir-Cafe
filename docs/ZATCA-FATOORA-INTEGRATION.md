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

- `ZATCA_EGS_PRIVATE_KEY` — PEM-encoded private key matching the EGS CSR/CSID certificate; required by sandbox invoice generation.
- `ZATCA_ONBOARDING_ENCRYPTION_KEY` — Base64-encoded 32-byte AES-256-GCM key used to encrypt/decrypt onboarding credentials.
- `ZATCA_SANDBOX_TOKEN` / `ZATCA_SANDBOX_SECRET` — legacy sandbox adapter credentials; generated-invoice sandbox submission uses the encrypted sandbox CSID envelope from onboarding.
- `ZATCA_PROD_TOKEN` / `ZATCA_PROD_SECRET` — reserved for a separately verified production CSID; production callables remain locked.

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

The queue assesses seller-profile completeness, invoice-line validity, refund status, POS currency, line-level VAT metadata and POS arithmetic reconciliation. Every new POS sale line inherits the global VAT setting automatically: the default Saudi standard-rated case is category `S` at 15%, with VAT-inclusive product prices. No per-product VAT setup is required for ordinary cafe products. The product editor may retain an optional category/rate override only for a product whose legally verified treatment differs (for example, zero-rated or exempt); menu categories such as Drinks/Food are never treated as tax categories. Existing historical sales without saved tax classification are not silently reclassified. The POS's displayed VAT amount is calculated from the global VAT-inclusive price setting; the queue independently reconciles the gross line prices, VAT-exclusive subtotal, discount, VAT and total before invoice generation. This is a safety check, not a substitute for official SDK validation. Menu categories such as Drinks/Food must never be treated as VAT categories. The queue checks line extension amounts against subtotal, subtotal minus discount plus VAT against total, and the VAT computed from each line's category/rate against the stored POS VAT total (0.02 SAR tolerance). Standard-rated lines require a positive rate; zero-rated, exempt and out-of-scope lines require zero rate. Combo products currently have no tax breakdown and remain blocked for manual review. Current states include:
- `blocked_profile`: seller profile is incomplete or disabled.
- `manual_review`: sale data is not suitable for invoice creation.
- `credit_note_required`: refund needs a separate compliant credit-note workflow.
- `awaiting_egs_review`: sale is recorded, but currency/tax/document classification or the EGS pipeline needs review.

The signed-in submit endpoint also uses `submission_unknown` when a request may have reached the gateway but no definitive response was received. Do not reset this state or retry the UUID until the gateway outcome has been reconciled.

**Important:** every transaction must be classified as Standard or Simplified from its buyer and transaction details. A global default alone is not sufficient. The POS checkout now records the invoice type per transaction. Standard (B2B) selection requires buyer legal name, Saudi VAT number and address fields; the queue validates their presence and VAT-number format. Buyer details remain on the source sale record and are not duplicated into the ZATCA queue. The cashier must explicitly choose Standard or Simplified for every sale; there is no preselected document type. This is data capture and preflight only; it does not determine legal classification automatically. The POS still has no compliant invoice generator, so queued records intentionally remain in review and are not automatically submitted.

The built-in Node test suite is `npm test` in `functions/` and uses `node --test`.


## Local CSR generation (no private key upload)

The EGS CSR and its matching secp256k1 private key can be created on a trusted local computer. From the `functions/` directory, run:

```bash
npm run zatca:csr -- --vat 312345678901233 --organization "Musafir Cafe LLC" --branch "Madinah Branch" --address "Shop registered short address, Madinah" --industry "Cafe and Restaurant" --environment sandbox
```

The command creates a unique EGS serial, generates and verifies a PKCS#10 CSR with OpenSSL, and stores the private key, CSR, Base64 CSR and config under the repository-root `.secrets/zatca/` directory. That directory is Git-ignored. The default functionality map `1100` enables Standard and Simplified invoices; use `--invoice-type 0100` only if the EGS is intended to issue Simplified invoices only. Environment selects the CSR certificate template: sandbox `TSTZATCA-Code-Signing`, simulation `PREZATCA-Code-Signing`, production `ZATCA-Code-Signing`.

Only the Base64 CSR is supplied to the authenticated onboarding screen. The private key must remain secret and must be provisioned directly from the trusted machine into Firebase Secret Manager as `ZATCA_EGS_PRIVATE_KEY`; never paste it into chat, commit it, or upload it to the browser. This command does not request an OTP or call ZATCA. The taxpayer must obtain the appropriate OTP from the FATOORA portal and submit the CSR within the portal's validity window. CSR subject values must match the taxpayer's actual EGS unit and registered details; review them before requesting a CSID.
