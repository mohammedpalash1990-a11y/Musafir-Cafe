# ZATCA — বর্তমান অবস্থা ও ডিপ্লয় গাইড

> **গুরুত্বপূর্ণ:** এই রিলিজে শুধু ZATCA business profile save, server-side readiness check এবং status display আছে। এটি FATOORA integration নয়, কোনো invoice submit করে না, এবং ZATCA compliance/certification প্রমাণ করে না। Production বন্ধ।

## ১. এই রিলিজে যা আছে
- POS → Settings → ZATCA-তে seller name, VAT, CR ও address profile save।
- `functions/index.js`-এ `zatcaCheckSetup` callable: profile-এর প্রয়োজনীয় field ও VAT format পরীক্ষা করে।
- `functions/index.js`-এ `zatcaStatus` callable: বর্তমান profile-only অবস্থা দেখায়; EGS/CSID/compliance/submission status-কে “not configured” দেখায়।
- Firebase Functions-এর source `functions/` হিসেবে `firebase.json`-এ সেট করা।
- Node.js 20 runtime।

## ২. Firebase-এ deploy করার আগে
1. সঠিক Firebase project ID নিশ্চিত করুন। ভুল project-এ deploy করবেন না।
2. Firebase Authentication-এ Email/Password চালু এবং POS hosting domain authorized আছে নিশ্চিত করুন।
3. Cloud Functions deploy-এর জন্য Firebase project-এর প্রয়োজনীয় billing/Blaze setup এবং IAM permissions নিশ্চিত করুন।
4. কোনো password, OTP, private key বা certificate ChatGPT-তে পাঠাবেন না।

## ৩. Deploy
আপনার কম্পিউটার বা নিরাপদ terminal-এ repository clone/update করে চালান:

```sh
npm install -g firebase-tools
firebase login
firebase use <YOUR_FIREBASE_PROJECT_ID>
cd functions
npm install
npm test
cd ..
firebase deploy --only functions:zatca
```

`npm test` এখানে শুধু function entrypoint-এর JavaScript syntax পরীক্ষা করে; এটি live ZATCA বা Firebase end-to-end test নয়।

## ৪. POS থেকে যাচাই
1. POS-এ আপনার account দিয়ে login করুন।
2. Settings → ZATCA-তে business profile পূরণ করে Save করুন।
3. “Check ZATCA setup readiness” চাপুন; missing field দেখালে ঠিক করুন।
4. “Refresh ZATCA status” চাপলে এই রিলিজে EGS onboarding, CSID, compliance checks ও invoice submission “not configured” দেখাবে।

## ৫. এখনো যা করা হয়নি
- FATOORA developer portal onboarding ও EGS CSID request।
- CSR/private key/certificate lifecycle এবং secure Secret Manager integration।
- Official ZATCA SDK দিয়ে UBL 2.1 XML, hash, signature, QR validation।
- Simplified invoice Reporting এবং Standard invoice Clearance।
- Retry/idempotency, audit trail, credit/debit notes, production approval।
- POS sale completion থেকে ZATCA invoice generation/submission।

এই কাজগুলো সম্পূর্ণ ও official SDK/Sandbox-এ যাচাই না হওয়া পর্যন্ত POS receipt-কে ZATCA-compliant tax invoice হিসেবে ব্যবহার করবেন না। Production কোনোভাবেই enable করবেন না।