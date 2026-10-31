# Saudi VAT and ZATCA FATOORA — Musafir Super Market POS

## Current application status

The POS includes a ZATCA business-profile form in Settings. It can store seller legal name, VAT registration number, CR number, address and invoice type in the signed-in user's existing POS settings document.

**This is profile storage and server-side profile readiness checking only. It is not a ZATCA integration or certification.** The repository contains zatcaCheckSetup and zatcaStatus callable functions under functions/; they must still be deployed to the connected Firebase project. No CSID/certificate onboarding, signed UBL 2.1 invoice generation, complete TLV QR, or Reporting/Clearance API connection is implemented. Do not describe receipts from this application as ZATCA-compliant tax invoices.

## Saudi requirements to account for

- ZATCA describes Phase 1 (Generation) as enforceable from 4 December 2021 for taxpayers subject to the e-invoicing regulation.
- Phase 2 (Integration) has been rolling out in waves since 1 January 2023. ZATCA notifies targeted taxpayers at least six months before their integration date. Check the taxpayer's own notification; do not assume every business has the same deadline.
- ZATCA states that human-readable invoice data fields must be in Arabic. An invoice may also include English (bilingual).
- Standard VAT is 15%; some supplies may be zero-rated. Apply the correct tax treatment to the actual supply and the business's VAT registration status. The POS VAT rate is manually configurable and should not be treated as tax advice.

## Required engineering before production

1. Confirm the taxpayer's VAT registration, business details, invoice types and Phase 2 wave.
2. Complete FATOORA EGS onboarding and obtain the correct CSID(s) for the required functionality map.
3. Implement ZATCA's current XML implementation standard, invoice UUID, invoice sequencing, previous-invoice hash chain, XML canonicalization/hash/signature, cryptographic stamp, QR TLV and immutable audit records.
4. Implement Reporting for Simplified invoices and Clearance for Standard invoices, including response validation, retries and idempotency.
5. Validate invoices using the official ZATCA SDK and Sandbox. Complete the relevant compliance and simulation tests before production credentials are enabled.
6. Store secrets only server-side in a suitable secret manager. Never put ERAD passwords, OTPs, CSID secrets, private keys or certificates in browser JavaScript or chat.

## Official ZATCA references

- Roll-out phases: https://zatca.gov.sa/en/E-Invoicing/Introduction/Pages/Roll-out-phases.aspx
- E-invoicing FAQ (including Arabic invoice language requirement): https://zatca.gov.sa/en/E-Invoicing/Introduction/FAQ/Pages/default.aspx
- Standard VAT rate FAQ: https://zatca.gov.sa/en/HelpCenter/FAQs/Pages/FAQArchiveEservices.aspx?page=Tax-FAQs-9
- E-invoicing implementation rules and specifications: https://zatca.gov.sa/en/RulesRegulations/Taxes/Pages/ConReqTech.aspx
- Developer portal: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/Pages/default.aspx
- Compliance & Enablement SDK: https://www.zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Pages/DownloadSDK.aspx

## Deployment status

Firebase Functions source is configured in firebase.json and the profile-only callables are in functions/. They have not been deployed from this repository update. Deploy only after confirming the Firebase project and permissions. This deployment does not onboard an EGS, request CSIDs, or submit invoices. Build and verify the full Sandbox integration separately before any production deployment.
