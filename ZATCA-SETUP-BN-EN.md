# Musafir POS — Saudi ZATCA FATOORA integration work

## Current state in this package
- Added a bilingual Arabic/English ZATCA business-profile panel under Settings.
- The profile is stored inside the existing user's `pos/settings` document, using the existing Firebase account.
- Added a Firebase callable function `zatcaCheckSetup` in `functions/index.js`. It checks profile completeness only.
- No FATOORA credentials, OTP, private key or certificate are stored in browser code.

## Important: not production compliant yet
This is an integration foundation, NOT a completed or approved ZATCA integration. Do not issue this app's current receipt as a ZATCA-compliant tax invoice based only on this patch. It does not yet generate the final UBL 2.1 XML, apply the EGS cryptographic stamp, create the complete ZATCA TLV QR, call Reporting/Clearance endpoints, or handle ZATCA response/retry states.

## Next implementation steps
1. Confirm the taxpayer's VAT registration and the ZATCA Phase 2 integration notification / applicable wave.
2. Complete FATOORA EGS onboarding and obtain the correct CSID(s) for the required functionality map (simplified, standard, or both).
3. Implement the current ZATCA XML implementation standard and security features using the official developer specifications and Compliance & Enablement SDK.
4. Implement server-side invoice sequencing, UUID, previous-invoice hash chain, XML canonicalization/hash/signature, QR TLV and immutable audit logs.
5. For Standard invoices/notes, implement Clearance; for Simplified invoices/notes, implement Reporting, with response validation and retry-safe idempotency.
6. Validate generated invoices with the official ZATCA SDK, then run Sandbox onboarding and end-to-end tests before production credentials are enabled.

## Firebase deployment (not run)
From this folder's parent project root, initialize/configure Firebase Functions if not already configured, then install dependencies in `functions/` and deploy only after reviewing the existing Firebase project configuration. This package deliberately does not include a Firebase CLI config because the existing repository's deployment setup has not been provided.

## Sensitive setup
Never paste ERAD password, OTP, CSID secret, private key or certificate into chat or frontend JavaScript. Store production secrets only in an approved server-side secret store (e.g. Google Secret Manager / Firebase Functions secrets) with least-privilege access.

## Official references
- ZATCA Developer Portal: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx
- E-Invoice specifications: https://www.zatca.gov.sa/en/e-invoicing/systemsdevelopers/pages/e-invoice-specifications.aspx
- Simplified technical guide: https://www.zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/Simplified-technical-guide.aspx
- Compliance & Enablement SDK: https://www.zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx
- ZATCA FAQ: https://www.zatca.gov.sa/en/E-Invoicing/Introduction/FAQ/Pages/default.aspx
