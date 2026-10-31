MUSAFIR SUPER MARKET — ONLINE ADMIN POS
======================================

এই সংস্করণটি Musafir-Cafe-FINAL ফাইলের মূল POS কাঠামো ও Firebase email/password login ধরে তৈরি। এটি LOCAL SERVER / Termux ব্যবহার করে না। ওয়েবসাইটটি HTTPS hosting-এ প্রকাশ করতে হবে; ডেটা Firebase Firestore-এ আপনার লগইন করা Admin account-এর অধীনে থাকবে।

যা আছে
------
1. Email + Password Admin login এবং Forgot Password (Sign up button সরানো হয়েছে; বিদ্যমান Admin account ব্যবহার করুন)।
2. এক দোকান / এক Admin ব্যবহারের জন্য সরল POS navigation।
3. পণ্য যোগ/সম্পাদনা: নাম, বাংলা নাম, barcode/SKU, ক্রয়মূল্য, বিক্রয়মূল্য, category, stock, ছবি।
4. Barcode scanner: USB/Bluetooth scanner যেটি keyboard-এর মতো barcode লিখে Enter পাঠায়, সেটি ব্যবহার করা যাবে। বিক্রির পাতার Barcode ঘরে স্ক্যান করুন।
5. বিক্রি, invoice, payment, customer due/ledger এবং stock কমানো।
6. Purchase entry: পণ্য কেনা, পরিমাণ ও unit cost লিখলে stock বাড়ে।
7. Shop expenses এবং Sales / Cost / Purchase / Expense / Estimated profit summary।
8. JSON backup ও restore।
9. বাংলা / English / বাংলা+English ভাষা পছন্দের বিদ্যমান ব্যবস্থা।
10. Grocery data আলাদা Firestore collection-এ: grocery_pos ও grocery_sales। Musafir Cafe-এর পুরনো pos ও sales collection এই অ্যাপ ব্যবহার করে না।

গুরুত্বপূর্ণ সীমাবদ্ধতা
--------------------
- Camera দিয়ে barcode scan সব browser-এ নিশ্চিত নয়; এই সংস্করণে নিশ্চিতভাবে সমর্থিত পদ্ধতি হলো USB/Bluetooth keyboard-type barcode scanner।
- Google/Firebase Auth ও Firestore ইন্টারনেট সংযোগে কাজ করে। কোনো local server বা Termux দরকার নেই।
- Firebase Firestore Rules-এ লগইন করা ব্যবহারকারীকে শুধু নিজের users/{uid}/... ডেটা পড়া/লেখার অনুমতি থাকতে হবে। আপনার আগের Rules না দেখে সেগুলো অন্ধভাবে replace করবেন না।
- নতুন বিক্রির profit হিসাবের জন্য পণ্যের Purchase cost আগে বসাতে হবে। পুরনো বিক্রির cost data না থাকলে সেই বিক্রির profit নির্ভুল হবে না।
- এটি এক দোকানের Admin POS; staff account / multi-branch / online customer ordering এখানে রাখা হয়নি।

প্রকাশ করার ৬ ধাপ
-----------------
1. ZIP extract করে সব ফাইল GitHub repository-র root-এ upload/replace করুন।
2. GitHub repository Settings → Pages থেকে Deploy from branch → main → /(root) নির্বাচন করে Save করুন। অথবা আপনার আগের HTTPS hosting-এ root files publish করুন।
3. Firebase Console → Authentication → Sign-in method-এ Email/Password Enabled আছে নিশ্চিত করুন।
4. Firebase Console → Authentication → Settings → Authorized domains-এ আপনার GitHub Pages/hosting domain যোগ করুন।
5. Firebase Console → Firestore Database → Rules-এ নিশ্চিত করুন authenticated user শুধু নিজের users/{uid}/... path পড়তে/লিখতে পারে। উদাহরণ:

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/{document=**} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }

   সতর্কতা: আপনার Musafir Cafe অন্য collection ব্যবহার করলে বর্তমান Rules-এর সঙ্গে মিলিয়ে নিন; উপরেরটি সরাসরি replace করলে অন্য অ্যাপের access বদলে যেতে পারে।

6. প্রকাশিত HTTPS URL খুলে আগের Musafir Cafe Admin email/password দিয়ে লগইন করুন। প্রথমবার Products-এ পণ্য যোগ করুন; Barcode/SKU ও Purchase cost দিন। তারপর USB/Bluetooth barcode scanner দিয়ে বিক্রি পরীক্ষা করুন।

প্রথমে আপনার যা করতে হবে
-----------------------
- GitHub-এ ZIP-এর ভেতরের ফাইলগুলো upload করুন।
- Pages চালু করে প্রকাশিত URL পাঠান।
- Firebase-এ Firestore Rules ঠিক আছে কিনা নিশ্চিত করুন।

এই ZIP-এ Firebase project config আগের Musafir Cafe ফাইলের মতোই রাখা হয়েছে। Grocery ডেটা আলাদা collection-এ যাবে, তাই পুরনো Cafe sales/products মিশবে না।
