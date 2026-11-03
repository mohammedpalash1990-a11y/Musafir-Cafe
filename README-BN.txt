MUSAFIR CAFE — POS ও CUSTOMER MENU
==================================

এই repository-তে Musafir Cafe-এর browser-based POS এবং customer-facing menu/order page রাখা হয়েছে। প্রধান অ্যাপ: index.html (POS) এবং order.html (customer menu/order UI)। manifest.json ও sw.js PWA installation এবং service-worker caching পরিচালনা করে।

## বর্তমান অ্যাপের কাঠামো

- POS: index.html
- Customer menu/order page: order.html
- PWA metadata: manifest.json
- Service worker/cache: sw.js
- Firebase client initialization: index.js
- Firebase Functions: functions/
- ZATCA integration notes: docs/ এবং ZATCA-*.md

## POS ও ডেটা

বর্তমান client code-এ Firebase Email/Password authentication এবং authenticated user-এর অধীনে Firestore data path ব্যবহার করা হয়। প্রধান POS data path-গুলোর মধ্যে users/{uid}/pos এবং users/{uid}/sales রয়েছে। নতুন deployment বা migration-এর আগে বাস্তব Firebase project, existing documents এবং deployed Security Rules আলাদাভাবে যাচাই করতে হবে।

POS-এ থাকা/ডকুমেন্টেড workflow:
- Product create/edit, category, price, stock এবং product image
- Barcode/SKU search এবং keyboard-wedge USB/Bluetooth scanner workflow
- Sales, receipt, discount, payment split, due/customer ledger এবং stock deduction
- Purchase entry এবং purchase history
- Expenses/Khata, sales reporting, CSV copy এবং JSON backup/restore
- English, বাংলা ও Arabic/RTL language support এবং theme controls
- PWA caching; network না থাকলে কিছু UI asset cache থেকে খোলা যায়

গুরুত্বপূর্ণ: service-worker asset caching মানেই সম্পূর্ণ offline database বা conflict-free multi-device sync নয়। Offline sale queue, reconnect sync, duplicate prevention এবং multi-device conflict behavior বাস্তব ডিভাইসে পরীক্ষা করতে হবে।

## Customer menu / order page

order.html customer-facing menu/order interface। GitHub-এ page থাকা মানেই customer order সফলভাবে POS-এ পৌঁছায়—এটি প্রমাণিত নয়। Production release-এর আগে menu product mapping, order write path, order status lifecycle, payment/delivery fields, duplicate submission handling এবং POS-side order visibility end-to-end পরীক্ষা করতে হবে।

## Firebase ও security

1. Firebase Authentication-এ প্রয়োজনীয় sign-in method enabled এবং hosting domain Authorized domains-এ থাকতে হবে।
2. Firestore Rules অবশ্যই authenticated UID/tenant boundary অনুযায়ী access সীমাবদ্ধ করবে।
3. Rules পরিবর্তনের আগে deployed rules export/backup ও review করতে হবে।
4. Client-এ private API key, ZATCA token/secret, private key, OTP বা encryption key রাখা যাবে না।
5. Firebase Functions deployment-এর আগে project ID, billing, region, runtime, Secret Manager এবং IAM permission যাচাই করতে হবে।

এই repository-র Firebase Functions ZATCA workflow-এর জন্য। Functions test command:
`cd functions && npm ci && npm test`

## Saudi VAT ও ZATCA

- POS global VAT setting এবং VAT-inclusive price calculation সমর্থনের code/tests রয়েছে। 15% standard rate কেবল প্রযোজ্য registered business এবং standard-rated supply-এর ক্ষেত্রে ব্যবহার করতে হবে।
- উদাহরণ: VAT-inclusive SAR 9.90 হলে 15% VAT breakdown প্রায় SAR 8.61 net + SAR 1.29 VAT; checkout total SAR 9.90-ই থাকে।
- Product-specific exceptional tax treatment accountant/ZATCA guidance ছাড়া অনুমান করা যাবে না।
- ZATCA code-এ sandbox onboarding, CSR generation, invoice XML/signing, SDK evidence gate এবং explicit sandbox submission workflow রয়েছে।
- GitHub unit tests বা code presence ZATCA certification নয়। Official current ZATCA SDK PASS, taxpayer-owned sandbox end-to-end evidence, Production CSID এবং accountant/ZATCA review ছাড়া production compliance দাবি করা যাবে না।
- Production submission নিরাপত্তার কারণে sandbox workflow থেকে আলাদা এবং credentials/authorization ছাড়া enable করা যাবে না।

বিস্তারিত নির্দেশনা:
- ZATCA-SETUP-BN-EN.md
- ZATCA-TESTING-BN.md
- docs/ZATCA-FATOORA-INTEGRATION.md
- docs/ZATCA-OTP-CSID-ONBOARDING.md
- docs/POS-GLOBAL-VAT.md

## Automated validation

GitHub Actions workflow: .github/workflows/validate.yml

এটি POS/customer page inline JavaScript, service worker ও Functions JavaScript syntax check এবং Functions unit tests চালায়। CI pass হওয়া browser/Firebase end-to-end QA বা production deployment-এর বিকল্প নয়।

## Release checklist

- [ ] Existing POS workflows regression test: product, purchase, stock, sale, receipt, due, expense, report, backup/restore
- [ ] বাংলা/English/Arabic language এবং RTL visual test
- [ ] POS PWA install/update এবং service-worker cache refresh test
- [ ] Offline sale queue, reconnect sync, duplicate protection এবং multi-device behavior test
- [ ] Customer menu থেকে order submit এবং POS-এ order visibility end-to-end test
- [ ] Pickup/home-delivery, customer contact, payment state এবং order status lifecycle test
- [ ] Firebase Auth, Firestore Rules, tenant isolation ও backup/restore audit
- [ ] Daily report reconciliation: sales, purchases, expenses, salary, due এবং profit definitions
- [ ] VAT calculation and invoice regression tests
- [ ] Official ZATCA SDK and taxpayer-owned sandbox tests
- [ ] HTTPS hosting deployment and live smoke test

## Deployment সতর্কতা

এই repository-তে code থাকা মানেই Firebase production deployment বা live website deployment সম্পন্ন হয়েছে—এমন নয়। Deployment-এর আগে project owner-এর Firebase/hosting access, production data backup, approved security rules, required secrets এবং test evidence আবশ্যক। কোনো secret, OTP বা private key GitHub issue, commit বা chat-এ শেয়ার করবেন না।
