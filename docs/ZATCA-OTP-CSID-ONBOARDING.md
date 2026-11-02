# FATOORA OTP and CSID onboarding runbook

This runbook documents the guarded onboarding sequence. It does not claim that a CSR, OTP, CSID, invoice, or production registration exists until the taxpayer and ZATCA complete the relevant steps.

## What the taxpayer must do

1. Sign in to the official FATOORA portal using the taxpayer's authorized account.
2. Open the EGS onboarding / OTP area and generate a fresh OTP. ZATCA says OTP generation is performed in the portal, is mandatory for onboarding/renewal, and OTPs are valid for one hour. Never send the OTP in GitHub issues, chat, email, source code, or logs.
3. Generate a CSR for the specific EGS using the official ZATCA SDK / current CSR configuration requirements. The CSR must match the VAT registration and EGS identity. Keep the matching private key in secure, access-controlled storage; the private key must never be sent to the browser, GitHub, Firestore, or this chat.
4. Submit the CSR with the portal OTP to the Compliance CSID API. A Compliance CSID and request ID are issued for compliance checks.
5. Run every applicable official compliance invoice check for the EGS Functionality Map (Standard/B2B, Simplified/B2C, and the required credit/debit note scenarios). Resolve every validation error.
6. Request the Production CSID using the Compliance CSID credentials and the corresponding compliance request ID. Store the returned Production CSID token and secret in Firebase Secret Manager, never in Firestore or client-side configuration.
7. Only after the Production CSID is confirmed and the full EGS pipeline passes official SDK and sandbox validation may a deployment administrator enable production flags.

## API sequence

All requests use Accept-Version: V2, Accept: application/json, and Content-Type: application/json.

- Compliance CSID: POST {simulation|core}/compliance, with the portal-issued OTP header and a JSON body containing the CSR.
- Compliance invoice checks: POST {simulation|core}/compliance/invoices, authenticated with the Compliance CSID token and secret. Submit each signed test invoice using the official prescribed payload.
- Production CSID: POST {simulation|core}/production/csids, authenticated with the Compliance CSID token and secret; include the matching compliance_request_id in the request body. ZATCA's developer manual describes this as the Production CSID onboarding sequence.

The codebase currently validates OTP/CSR input shape and CSID response shape. The production CSR generation, private-key custody, official invoice fixtures, compliance invoice calls, and certificate installation remain gated; do not interpret input validation as ZATCA acceptance.

## Secret names

- ZATCA_SANDBOX_TOKEN / ZATCA_SANDBOX_SECRET: sandbox Production CSID pair used by the current invoice adapter.
- ZATCA_PROD_TOKEN / ZATCA_PROD_SECRET: production Production CSID pair.
- Compliance credentials must be held separately from Production credentials while onboarding. Do not overwrite production secrets with Compliance CSID values.

## Official references

- ZATCA E-Invoicing Detailed Technical Guideline: https://www.zatca.gov.sa/en/E-Invoicing/Introduction/Guidelines/Documents/E-invoicing-Detailed-Technical-G.pdf
- ZATCA Developer Portal Manual: https://zatca.gov.sa/en/E-Invoicing/SystemsDevelopers/ComplianceEnablementToolbox/Documents/Developer%20Portal%20User%20Manual.pdf
- ZATCA Sandbox Developer Portal Manual: https://sandbox.zatca.gov.sa/User_Manual_Developer_Portal_Manual_Version_3.pdf
