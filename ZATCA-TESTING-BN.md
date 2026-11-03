# Musafir Cafe — ZATCA Sandbox ও Production প্রস্তুতি

এই গাইডে বর্তমান repository-তে বাস্তবে থাকা workflow দেওয়া হলো। **এখনো Production-ready বা ZATCA-certified নয়।** POS-এর স্বাভাবিক checkout/offline sync চালু থাকবে; ZATCA queue তৈরি হলেও নিজে থেকে invoice submit হয় না।

## ১. Global VAT সেটিং

POS → Settings → Shop, backup & login → Saudi VAT:
- VAT enabled: ON
- VAT rate: 15
- Product prices include VAT: ON

একটি পণ্যের POS price 9.90 SAR হলে:
- VAT ছাড়া মূল্য: 8.61 SAR
- VAT: 1.29 SAR
- কাস্টমারের মোট: 9.90 SAR

প্রতিটি সাধারণ পণ্যে আলাদা VAT বসাতে হবে না। Standard-rated 15% global default ব্যবহার হবে। কোনো পণ্যের আইনগত tax treatment সত্যিই zero-rated/exempt/out-of-scope হলে accountant/ZATCA guidance অনুযায়ী explicit override দিতে হবে।

## ২. Firebase deploy-এর আগে

1. Firebase project, billing plan ও Functions deployment permission যাচাই করুন।
2. `functions/` directory-তে `npm install` এবং `npm test` চালান।
3. Secret Manager-এ নিচের secrets নিরাপদে provision করুন:
   - `ZATCA_ONBOARDING_ENCRYPTION_KEY`: Base64-encoded 32-byte AES-256-GCM key.
   - `ZATCA_EGS_PRIVATE_KEY`: CSR/CSID certificate-এর সঙ্গে মেলা PEM private key.
4. Private key, CSID token/secret, OTP বা encryption key কখনো GitHub, browser, Firestore profile বা ChatGPT chat-এ দেবেন না।
5. Firebase project ID ও deployed Firestore Security Rules যাচাই করুন। Sales, buyer details, invoice XML এবং onboarding records শুধু সংশ্লিষ্ট authenticated tenant ও trusted server-side code-এর জন্য সীমাবদ্ধ থাকতে হবে।

## ৩. Sandbox onboarding

1. POS → Settings → ZATCA-তে seller legal name, 15-digit Saudi VAT number, registered address ও CR তথ্য পূরণ করুন; profile save করুন।
2. Official ZATCA CSR profile অনুসারে CSR এবং matching private key তৈরি করুন। Private key Firebase Secret Manager-এ রাখুন; শুধু Base64 CSR public request field-এ দিন।
3. FATOORA Developer Portal থেকে OTP সংগ্রহ করে POS-এর Sandbox Compliance CSID form-এ দিন। OTP স্বল্পমেয়াদি; chat-এ পাঠাবেন না। Submit করার পর OTP field খালি হবে।
4. Compliance CSID request ID সংরক্ষণ করুন।
5. Official SDK-validated six scenario fixtures (Standard/Simplified invoice, credit note, debit note) দিয়ে compliance checks চালান। বর্তমান backend conservative six-scenario gate ব্যবহার করে; taxpayer-এর EGS Functionality Map অনুযায়ী official requirement নিশ্চিত করতে হবে।
6. সব প্রয়োজনীয় scenario PASS হলে Sandbox Production CSID request করুন। Credential server-side AES-256-GCM encrypted অবস্থায় রাখা হয়।

## ৪. Sandbox invoice generation ও validation

1. POS sale document ID নির্বাচন করুন।
2. `Generate & sign sandbox invoice` চাপুন।
3. `Download XML for official SDK validation` দিয়ে XML নামান।
4. ZATCA-এর বর্তমান official SDK/Compliance & Enablement Toolbox দিয়ে invoice ও QR validate করুন। SDK version, command এবং report সংরক্ষণ করুন।
5. SDK validation PASS না হলে invoice submit করবেন না।
6. PASS হলে `Submit to sandbox after SDK validation` ব্যবহার করুন। Simplified invoice Reporting-এ এবং Standard invoice Clearance-এ যায়।
7. FATOORA response status ও request ID যাচাই করুন। Timeout/ambiguous outcome হলে `submission_unknown` ধরে reconciliation ছাড়া একই UUID পুনরায় submit করবেন না।

## ৫. বর্তমান সীমাবদ্ধতা

- POS sale trigger শুধু idempotent ZATCA queue record তৈরি করে; automatic invoice generation/submission এখনো চালু নয়।
- Invoice generation ও sandbox submission আলাদা manual operator actions.
- UBL 2.1, hash/PIH, ECDSA/XAdES ও TLV QR implementation আছে, কিন্তু current official ZATCA SDK দিয়ে যাচাই এখনো বাকি।
- Refund/return action-এর সঙ্গে compliant credit note flow সম্পূর্ণভাবে যুক্ত নয়।
- Combo item tax breakdown এবং কিছু historical sale manual review চাইতে পারে।
- Firestore deployed rules, taxpayer-owned OTP/CSID, sandbox E2E এবং Production CSID এখানে থেকে যাচাই করা হয়নি।
- Production flags/code কখনো enable করবেন না যতক্ষণ official SDK, sandbox E2E, taxpayer Production CSID এবং accountant/ZATCA approval সম্পন্ন না হয়।

## ৬. Production-এ যাওয়ার আগে

Production activation-এর জন্য taxpayer-এর real FATOORA onboarding, Production CSID, official SDK PASS, end-to-end Clearance/Reporting evidence, retry/reconciliation procedure, Firestore rules audit এবং refund/credit-note workflow সম্পন্ন করতে হবে। এগুলো ছাড়া POS receipt-কে ZATCA-compliant tax invoice বলা যাবে না।