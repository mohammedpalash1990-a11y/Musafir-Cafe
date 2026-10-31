MUSAFIR SUPER MARKET POS
========================

এই repository-তে Musafir Super Market-এর browser-based POS রাখা হয়েছে। পুরোনো Musafir logo এবং Firebase project config রাখা হয়েছে। অ্যাপটি English / Arabic (RTL) / বাংলা / বাংলা+English ভাষা সমর্থন করে। Saudi Riyal (ر.س), Cash, Card, Mada, STC Pay, Bank Transfer এবং Due payment option আছে।

বর্তমান POS ফিচার
-----------------
- Firebase Email/Password authentication; আগের Firebase project-এর authenticated user data path ব্যবহার করে।
- পণ্য যোগ/সম্পাদনা, English / Bangla / Arabic নাম, barcode/SKU, ক্রয়মূল্য, বিক্রয়মূল্য, category, stock এবং ছবি।
- Barcode workflow: exact SKU/barcode scan করলে পণ্য কার্টে যোগ হয়; code না মিললে search results-এ matching products দেখায়।
- Wired USB এবং Bluetooth keyboard-wedge scanner: দুটোই keyboard input হিসেবে কাজ করে; POS search box-এ focus রেখে scan করুন (scanner Enter suffix পাঠাবে)।
- Supported browser/device-এ camera barcode scan (BarcodeDetector API) আছে; HTTPS camera permission প্রয়োজন। Unsupported browser হলে USB/Bluetooth scanner ব্যবহার করুন।
- Sales, receipt, discount, manually configured VAT, split payments, due/customer ledger এবং stock deduction।
- Purchase entry: supplier name, product, quantity এবং unit purchase cost; purchase save করলে stock বৃদ্ধি পায় এবং purchase history সংরক্ষিত হয়।
- Existing expenses / Khata, sales reports, CSV copy, JSON backup / restore.
- PWA service worker caching. Firebase authentication এবং cloud sync-এর জন্য internet প্রয়োজন; offline sale local device-এ queue হতে পারে এবং reconnect হলে sync workflow আছে, তবে multi-device offline conflict-free guarantee নয়।

Firestore data
--------------
বর্তমান Firebase adapter authenticated user-এর অধীনে users/{uid}/pos এবং users/{uid}/sales collections ব্যবহার করে। POS documents-এর মধ্যে settings, products, due, purchases, log ইত্যাদি থাকে। পুরোনো collection path-এ migration করা হয়নি। Existing Firebase Rules-এ authenticated user-কে নিজের users/{uid}/... documents read/write করতে দিতে হবে। Rules পরিবর্তনের আগে deployed rules backup ও যাচাই করুন।

Saudi VAT / ZATCA সতর্কতা
------------------------
- Saudi Arabia-তে standard VAT rate 15%; VAT-registered business-এর ক্ষেত্রে প্রযোজ্য। VAT registration নিশ্চিত না করে VAT charge করবেন না। Settings থেকে VAT rate হাতে সেট করা যায়; 15% shortcut আছে।
- Settings-এর ZATCA section-এ seller profile, VAT number, CR, address এবং invoice type সংরক্ষণ করা যায়; `zatcaCheckSetup` callable function দিয়ে server-side profile readiness check করা যায়।
- এটি এখনো ZATCA FATOORA-তে connected বা certified নয়। Readiness checker শুধু profile field পরীক্ষা করে; invoice submit করে না। UBL 2.1 invoice XML, cryptographic stamp, full TLV QR, CSID onboarding, Reporting/Clearance API, retry/idempotency এবং official SDK/Sandbox end-to-end test সম্পূর্ণ না হওয়া পর্যন্ত এই POS-এর receipt-কে ZATCA-compliant tax invoice হিসেবে ব্যবহার করবেন না।
- VAT number, CR, address এবং invoice requirements আপনার accountant / ZATCA advisor-এর সঙ্গে যাচাই করুন।

প্রকাশ / পরীক্ষা
---------------
1. GitHub repository-র main branch থেকে আপনার HTTPS hosting বা GitHub Pages publish করুন।
2. Firebase Authentication-এ Email/Password enabled এবং hosting domain Authorized domains-এ আছে নিশ্চিত করুন।
3. Firestore Rules-এ users/{uid}/... path-এর access authenticated UID-তে সীমাবদ্ধ রাখুন।
4. পুরোনো Admin account দিয়ে login করে আগে test data-তে product, purchase, stock, sale, due, expense, Arabic RTL, receipt ও CSV পরীক্ষা করুন।
5. Production ব্যবহারের আগে backup নিন এবং real payment terminal / ZATCA integration আলাদাভাবে test করুন।

গুরুত্বপূর্ণ
-----------
- Barcode scanning-এর বর্তমান supported path হলো USB/Bluetooth keyboard-type scanner; camera barcode scan এখনো নিশ্চিতভাবে implemented নয়।
- Supplier entry এখন purchase record-এর supplier name হিসেবে রাখা হয়; আলাদা supplier directory, supplier balances এবং purchase returns এখনো নেই।
- Purchase records stock বাড়ায়; full landed-cost accounting, weighted-average costing এবং complete profit statement এখনো নেই।
- ZATCA profile form থাকা মানে live ZATCA integration নয়।
