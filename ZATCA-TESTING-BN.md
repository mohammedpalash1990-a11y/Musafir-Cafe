# ZATCA — ডিপ্লয় ও চালু করার গাইড (সহজ বাংলা)

## ১. একবারের সেটআপ (আপনার কম্পিউটারে)
```
npm i -g firebase-tools
firebase login
firebase use <আপনার-প্রজেক্ট-আইডি>
cd functions && npm install && npm test      # 14টি টেস্ট পাস হওয়ার কথা
cd .. && firebase deploy --only functions:zatca
```
Firebase কনসোলে লাগবে: **Blaze প্ল্যান**, **Secret Manager API** ও **Cloud Scheduler API** চালু, আর Functions-এর সার্ভিস অ্যাকাউন্টে **Secret Manager Admin** রোল।
(`zatcaRetryScheduled` ডিপ্লয়ে Scheduler-এর অঞ্চল নিয়ে এরর এলে আমাকে এরর লাইনটা পাঠান।)

## ২. Firestore Rules (আপনি অনুমতি দিয়েছেন)
`firestore.rules.ZATCA-ADD.txt` ফাইলের ২টি `match` লাইন আপনার rules-এ যোগ করে **Publish** করুন। ZATCA ডেটা (ইনভয়েস, হ্যাশ, অডিট) শুধু সার্ভার লিখবে। আপনার `users/{uid}/...` নিয়ম অপরিবর্তিত থাকবে।

## ৩. POS-এ ZATCA চালু করা (Settings → ZATCA ফোল্ডার)
1. প্রোফাইল পূরণ → **Save ZATCA business profile**। (VAT ১৫ ডিজিট, ৩ দিয়ে শুরু ও শেষ; বিল্ডিং ৪ ডিজিট; পোস্টাল ৫ ডিজিট)
2. Settings → Shop & VAT-এ **VAT ১৫%** দিন।
3. **Environment = Sandbox** → ধাপ ১ (Onboard) → ২ (Compliance checks) → ৩ (Production CSID) → ৪ (Activate)। Sandbox-এ OTP লাগে না।
4. **Auto-send invoices: ON** করুন, একটি টেস্ট বিক্রি করুন → রসিদে "تم الإبلاغ ✓ / Reported" ও QR আসবে (Sandbox-এ "TEST ONLY" লেখা থাকবে)।
5. **Refresh ZATCA status** চেপে অবস্থা দেখুন।

## ৪. অফিসিয়াল SDK যাচাই (আপনার কম্পিউটারে, Java লাগবে)
ZATCA Developer Portal থেকে SDK নামিয়ে একটি জেনারেটেড ইনভয়েসের XML-এ `fatoora -validate` ও `-qr` চালান। পাস না হওয়া পর্যন্ত ইনভয়েসকে "compliant" ধরবেন না। ফল আমাকে জানান।

## ৫. আসল (Production) চালু — শুধু আপনার OTP লাগবে
1. Fatoora পোর্টালে লগইন → EGS Onboarding → **OTP** নিন (একবার ব্যবহারযোগ্য, কিছুক্ষণ বৈধ)।
2. POS → Settings → ZATCA → **Environment = Production (LIVE)** → OTP ঘরে ৬ ডিজিট দিন → ধাপ ১ → ২ → ৩ → ৪।
3. LIVE-এ প্রতিবার নিশ্চিতকরণ বার্তা আসবে। OTP কোথাও জমা হয় না, ব্যবহারের পর ঘর খালি হয়।
**আগে Sandbox ও SDK টেস্ট পাস করুন, তারপর Production।**

## ৬. কী নিজে থেকে হয়
বিক্রি হলে → ইনভয়েস XML তৈরি, সই, হ্যাশ-চেইন, QR → ZATCA-তে Reporting → ফল রসিদে। নেট না থাকলে ফোনে জমা থাকে, নেট এলে আবার যায়; সার্ভারও প্রতি ১৫ মিনিটে ব্যর্থগুলো আবার চেষ্টা করে। ZATCA নিজে "REPORTED" না বললে কখনো সফল দেখানো হয় না।

## ৭. এখনো সীমাবদ্ধতা
- শুধু Simplified (B2C) ইনভয়েস অটো-যায়। Standard (B2B)-এ ক্রেতার তথ্য নেওয়ার ঘর POS-এ নেই।
- শুধু ১৫% VAT। শূন্য-হার/ছাড়প্রাপ্ত পণ্য সমর্থিত নয়।
- রিটার্ন/ক্রেডিট নোট ব্যাকএন্ডে আছে, POS-এর রিটার্ন বাটনের সঙ্গে এখনো জোড়া হয়নি।
- XML/সই/QR ZATCA-র স্পেক অনুযায়ী লেখা, কিন্তু অফিসিয়াল SDK দিয়ে আপনার মেশিনে যাচাই বাকি।
