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

## POS sale intake and VAT behavior

A Firestore `onDocumentCreated` trigger watches `users/{uid}/sales/{saleId}` and creates one idempotent work record at `users/{uid}/zatcaInvoices/sale-{saleId}`. This catches signed-in POS sales and sales uploaded later after offline use. It does not change checkout behavior, generate an invoice automatically, or send anything to ZATCA.

The POS has one global Saudi VAT setting. Every new sale line is classified as Standard-rated (`S`) using the global VAT rate; the default is 15%, and prices are VAT-inclusive. No product-level VAT fields or setup are required. For a VAT-inclusive menu price, the amount charged stays unchanged: SAR 9.90 contains SAR 8.61 net plus SAR 1.29 VAT (9.90 × 15 / 115). The POS must not add another 15% on top. This implementation is standard-rated-only; do not use it for goods or services with a legally different VAT treatment without adding and validating a separate tax-category workflow.

Historical sales without sufficient tax arithmetic or invoice classification remain in review rather than being silently rewritten. Combo products and refunds may require manual review. Refunds need a compliant credit-note flow; that flow is not yet connected to the POS refund action.

## Current automation boundary

- New POS/offline-synced sales are queued idempotently.
- An authorized operator can manually generate and sign a sandbox invoice from an existing sale after onboarding and Secret Manager setup.
- An operator must download the XML and run the official ZATCA SDK validation.
- Sandbox Reporting/Clearance submission is a separate, explicit action after SDK validation.
- No automatic submission is enabled. No production submission or certification is claimed.
- `submission_unknown` requires reconciliation before retrying; never blindly resend the same UUID.

The built-in Node test suite is `npm test` in `functions/` and uses `node --test`.


## Local CSR generation (no private key upload)

The EGS CSR and its matching secp256k1 private key can be created on a trusted local computer. From the `functions/` directory, run:

```bash
npm run zatca:csr -- --vat 312345678901233 --organization "Musafir Cafe LLC" --branch "Madinah Branch" --address "Shop registered short address, Madinah" --industry "Cafe and Restaurant" --environment sandbox
```

The command creates a unique EGS serial, generates and verifies a PKCS#10 CSR with OpenSSL, and stores the private key, CSR, Base64 CSR and config under the repository-root `.secrets/zatca/` directory. That directory is Git-ignored. The default functionality map `1100` enables Standard and Simplified invoices; use `--invoice-type 0100` only if the EGS is intended to issue Simplified invoices only. Environment selects the CSR certificate template: sandbox `TSTZATCA-Code-Signing`, simulation `PREZATCA-Code-Signing`, production `ZATCA-Code-Signing`.

Only the Base64 CSR is supplied to the authenticated onboarding screen. The private key must remain secret and must be provisioned directly from the trusted machine into Firebase Secret Manager as `ZATCA_EGS_PRIVATE_KEY`; never paste it into chat, commit it, or upload it to the browser. This command does not request an OTP or call ZATCA. The taxpayer must obtain the appropriate OTP from the FATOORA portal and submit the CSR within the portal's validity window. CSR subject values must match the taxpayer's actual EGS unit and registered details; review them before requesting a CSID.


## Official SDK validation gate before sandbox submission

After generating the immutable invoice, download the XML and run the current official ZATCA SDK locally. The POS then requires the operator to enter the SDK version and paste the PASS summary. The callable zatcaRecordSdkValidation binds that attestation and a SHA-256 digest of the evidence to the exact stored invoice hash; the sandbox submit callable refuses to proceed without a matching Validated record. This is an operator-attested gate, not remote execution or cryptographic verification of the SDK report. Keep the original SDK output for audit and never treat the attestation as ZATCA approval. Any changed invoice hash requires a fresh SDK run and PASS record.
