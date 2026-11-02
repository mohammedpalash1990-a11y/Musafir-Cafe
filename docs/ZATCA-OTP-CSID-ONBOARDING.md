# FATOORA OTP and CSID onboarding runbook

This runbook describes the sandbox onboarding callables currently added to Musafir Cafe. It is not evidence that a taxpayer has completed ZATCA onboarding or that a CSID has been issued.

## Taxpayer prerequisites

1. Sign in to the official FATOORA portal with the authorized taxpayer account.
2. Generate a fresh OTP from the EGS onboarding area. OTPs are short-lived (one hour according to ZATCA's developer portal manual). Never paste the OTP into GitHub, chat, email, tickets, source code, or logs.
3. Generate a CSR for the EGS using the current official ZATCA CSR configuration / SDK. The CSR must match the taxpayer VAT number and EGS identity. Keep the matching private key under tightly restricted server-side custody. Never upload the private key to the POS browser, Firestore, GitHub, or this chat.
4. Submit the CSR and OTP to the Compliance CSID endpoint.
5. Generate and sign the official compliance invoice test fixtures and run every required scenario for the EGS Functionality Map. The current callable tracks six explicit scenarios (Standard invoice/credit note/debit note and Simplified invoice/credit note/debit note); confirm the applicable matrix against the current official ZATCA guidance for the actual device profile.
6. Only after all applicable compliance scenarios return PASS should the Production CSID be requested.

## Implemented sandbox callables

All callables require Firebase Authentication and use the configured sandbox gateway. Production onboarding is intentionally blocked.

- `zatcaRequestComplianceCsid({ otp, csr })`: sends `POST /compliance`, with the OTP header and Base64 CSR body. It stores the non-secret request tracking record plus an encrypted credential envelope. The callable stores the Compliance CSID and secret encrypted at rest using AES-256-GCM. The encryption key is read from Firebase Secret Manager; the raw credentials are not returned to the browser.
- `zatcaSubmitComplianceInvoice({ requestId, scenario, uuid, invoiceHash, invoice, clearanceStatus })`: sends one pre-generated signed invoice to `POST /compliance/invoices`. It records the result server-side and marks a scenario passed only when the response contains `validationResults.status = PASS`. Standard scenarios require clearance status 1; Simplified scenarios require 0.
- `zatcaRequestProductionCsid({ requestId })`: server-checks all six tracked scenarios before calling `POST /production/csids`. The call is sandbox-only and stores the resulting sandbox CSID/secret encrypted at rest. It does not enable production submissions.

Before deploying these callables, create the encryption key with `openssl rand -base64 32` and set it with `firebase functions:secrets:set ZATCA_ONBOARDING_ENCRYPTION_KEY`. Never commit the generated value. Then deploy only to a non-production Firebase project for integration testing.

All API calls use `Accept-Version: V2`, `Accept: application/json`, and `Content-Type: application/json`. The existing gateway uses Basic authentication with the CSID token as username and secret as password for authenticated calls.

## Still required before production

- A compliant CSR/private-key generator matching the official ZATCA EGS configuration, with protected key custody and rotation.
- Provision and rotate the 32-byte base64 encryption key as a Firebase Secret Manager secret named ZATCA_ONBOARDING_ENCRYPTION_KEY; restrict secret access to the Functions runtime service account. The current encrypted Firestore envelope is for onboarding workflow state, not a replacement for the production invoice credential lifecycle.
- Official ZATCA SDK validation of generated CSR, signed UBL XML, invoice hash, signature, QR, and all required invoice types.
- Confirm the required compliance test matrix for the actual EGS Functionality Map; the six scenario tracker is a conservative gate, not a claim that every taxpayer's matrix is identical.
- End-to-end sandbox tests against the official gateway with taxpayer-owned test credentials and valid signed fixtures.
- Production CSID onboarding, secure storage in Firebase Secret Manager, independent administrator verification, deployment, and monitoring.
- End-to-end invoice generation/signing, PIH and ICV sequencing, credit/debit note workflows, and offline-safe idempotent submission.

## Secret names currently used by invoice adapter

- `ZATCA_SANDBOX_TOKEN` / `ZATCA_SANDBOX_SECRET`
- `ZATCA_PROD_TOKEN` / `ZATCA_PROD_SECRET`

Never place OTPs, CSID secrets, or private keys in source control or Firestore.

## Official references

- [ZATCA Developer Portal User Manual](https://www.zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Documents/Developer%20Portal%20User%20Manual.pdf)
- [ZATCA E-Invoicing Detailed Technical Guideline](https://www.zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-G.pdf)
- [ZATCA Sandbox Developer Portal Manual](https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf)
