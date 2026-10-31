# ZATCA Sandbox — ডিপ্লয় ও টেস্ট গাইড (সহজ বাংলা)

> **অবস্থা:** এটা শুধু **Sandbox**। Production বন্ধ (কোডে লক করা)। কোনো টেস্ট চালান Production-এ যায় না।

## ১. যা তৈরি হয়েছে
- `functions/` : নতুন ZATCA ব্যাকএন্ড (পুরোনো root `index.js` অক্ষত)
- `firebase.json` : শুধু functions ডিপ্লয়ের জন্য
- `index.html` : শুধু ৬ লাইন (ZATCA বক্সে স্ট্যাটাস প্যানেল + "Refresh ZATCA status" বাটন)

## ২. ডিপ্লয় (আপনার কম্পিউটারে)
```
npm i -g firebase-tools
firebase login
firebase use <আপনার-প্রজেক্ট-আইডি>
cd functions && npm install && npm test
cd .. && firebase deploy --only functions:zatca
```
প্রয়োজন: Blaze প্ল্যান; Secret Manager API ও Cloud Scheduler API চালু; Functions সার্ভিস অ্যাকাউন্টে **Secret Manager Admin** রোল।

## ৩. Sandbox ধাপ (এই ক্রমে)
1. POS → Settings → ZATCA প্রোফাইল পূরণ করে Save করুন।
2. `zatcaOnboardSandbox` কল → CSR তৈরি + Compliance CSID (Sandbox-এর OTP ZATCA-র প্রকাশ্য টেস্ট মান; আপনার কোনো OTP লাগবে না)।
3. `zatcaRunComplianceChecks` → ৩টি নমুনা (ইনভয়েস/ক্রেডিট/ডেবিট)।
4. পাস হলে `zatcaSandboxProductionCsid` (`{confirm:true}`)।
5. `zatcaSubmitInvoice` দিয়ে টেস্ট ইনভয়েস।

## ৪. অফিসিয়াল SDK টেস্ট (আপনার কম্পিউটারে, Java দরকার)
ZATCA Developer Portal থেকে Compliance & Enablement SDK নামান। একটি জেনারেটেড ইনভয়েসের `xml` ফিল্ড ফাইলে রেখে SDK-র `fatoora -validate -invoice <file>` এবং `-qr` চালান। **SDK পাস না করা পর্যন্ত কোনো ইনভয়েসকে "compliant" বলা যাবে না।** ফল আমাকে জানান।

## ৫. নিরাপত্তা — আপনার অনুমোদন দরকার (আমি প্রয়োগ করিনি)
ZATCA ডেটা সার্ভার-ওনলি টপ-লেভেল কালেকশনে (`zatca_tenants`, `zatca_retry_queue`) থাকে। আপনার Firestore Rules-এ যদি `match /{document=**}` ধরনের খোলা নিয়ম থাকে, ক্লায়েন্ট এগুলো বদলাতে পারবে। Rules ফাইল দেখে নিশ্চিত করুন এই দুটি কালেকশন ক্লায়েন্টের জন্য বন্ধ (read/write: false)।
