# Musafir POS — Automatic sandbox invoice drafts

## What happens

1. The POS writes a completed sale to `users/{uid}/sales/{saleId}`. The existing sale intake trigger creates the idempotent queue record `users/{uid}/zatcaInvoices/sale-{saleId}`.
2. A second Firestore trigger watches that queue record. It runs only for `source: pos_sale` and a sale assessed as `awaiting_egs`.
3. The ZATCA seller profile must be enabled in POS Settings. The Functions environment must be `sandbox`, and the seller's sandbox Production CSID onboarding record plus the matching EGS private key and onboarding encryption key must already be configured.
4. The shared POS preflight reconciles the saved sale against the global 15% VAT-inclusive setting. For a customer price of SAR 9.90, the invoice line is SAR 8.61 before VAT and SAR 1.29 VAT; the gross total remains SAR 9.90.
5. The existing idempotent invoice generator allocates ICV/PIH and creates the signed UBL invoice and TLV QR. The queue status becomes `generated_pending_sdk`.

The trigger also catches POS sales that reach Firestore later after offline use. It does not change the POS checkout, stock, due, or receipt flow.

## Important boundaries

- Draft generation is sandbox-only.
- The trigger never calls Reporting or Clearance. Submission remains a separate, explicit operator action after official SDK validation.
- It does not issue a CSID, request an OTP, or create a CSR/private key.
- Sales with missing buyer classification, invalid arithmetic, unsupported VAT treatment, refunds, or incomplete onboarding remain in review/blocked states.
- The current invoice pipeline is standard-rated 15% only. Do not use it for products with legally different VAT treatment until a separately validated tax-category flow exists.
- Existing historical queue records are not automatically replayed when onboarding is completed later; use the existing manual generation action for those sales.
- Official ZATCA SDK validation and taxpayer-owned sandbox Reporting/Clearance tests are still required. A successful local draft is not certification or approval.

## Required Firebase secrets

Provision these directly in Firebase Secret Manager; never put their values in source control, POS settings, Firestore, or chat:

- `ZATCA_EGS_PRIVATE_KEY`: PEM private key matching the sandbox EGS CSR/CSID certificate.
- `ZATCA_ONBOARDING_ENCRYPTION_KEY`: Base64-encoded 32-byte AES-256-GCM key.

The POS stores only the onboarding request ID in the seller profile. CSID token/secret remain encrypted in the onboarding document and are decrypted only in the trusted Functions runtime.

## Operator workflow

- Enable the ZATCA seller profile only after verifying the legal seller/VAT details.
- Complete sandbox OTP/CSID onboarding and provision the two secrets.
- Create a new POS sale online or offline; after it syncs, inspect its queue record.
- Download the generated XML using the authenticated invoice retrieval action and validate it with the current official ZATCA SDK.
- Only then use the explicit sandbox submission action. Resolve `submission_unknown` by reconciliation; never blindly resend the same UUID.
- Keep production flags disabled until official SDK validation, taxpayer-owned end-to-end sandbox verification, Production CSID issuance and security review are complete.
