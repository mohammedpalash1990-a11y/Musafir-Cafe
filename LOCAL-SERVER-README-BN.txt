# Musafir Cafe — Local Wi‑Fi Server (Windows + Android)

## এটা কী করবে?
দোকানের Internet বন্ধ থাকলেও একই Wi‑Fi/হটস্পটে থাকা customer ফোন থেকে order local server-এ জমা হবে। POS-এ order দেখা যাবে। Internet আবার এলে, POS browser-এ একই Firebase account-এ login করা থাকলে, local order/rating/menu Cloud/Firebase-এ sync করার চেষ্টা করবে। Cloud sync সফল না হলে order local-data-তে থাকবে; মুছে যাবে না।

## Windows PC-তে
1. ZIP Extract করুন।
2. PC-তে Python 3 ইনস্টল থাকলে `START-LOCAL-SERVER.cmd` ডাবল-ক্লিক করুন।
3. ব্রাউজারে `http://localhost:8080/index.html` খুলুন।
4. Internet থাকতেই এই localhost-এ একবার POS-এ login করে menu sync/load হতে দিন। তারপর QR Orders → QR Code থেকে QR print করুন।

## Android POS ফোন/ট্যাব থেকেই server চালাতে
1. Android-এ Termux ইনস্টল করুন (সাধারণত F-Droid-এর Termux ব্যবহার করা হয়)।
2. ZIP-এর ফাইলগুলো ফোনে একটি folder-এ Extract করুন, যেমন `Download/Musafir-Cafe-main`।
3. Termux খুলে চালান:

   pkg update
   pkg install python unzip
   termux-setup-storage
   cd ~/storage/downloads/Musafir-Cafe-main
   python server.py

   Folder অন্য জায়গায় হলে `cd`-এর path বদলাবেন।
4. একই ফোনের browser-এ `http://localhost:8080/index.html` খুলুন। Internet থাকা অবস্থায় ওই localhost-এ একবার POS account-এ login করে data/menu load হতে দিন।
5. QR Orders → QR Code থেকে QR খুলুন/print করুন বা `Customer QR URL` address ব্যবহার করুন।

## Customer কীভাবে অর্ডার দেবে?
- Customer-এর ফোন এবং POS/server একই দোকানের Wi‑Fi-তে বা POS-এর hotspot-এ থাকতে হবে।
- Customer QR scan করবে; mobile data থাকলেও phone-কে Wi‑Fi থেকে disconnect হতে দেবেন না। Android “No Internet” বললে Stay connected বেছে নিন বা mobile data সাময়িক বন্ধ করুন।
- Server terminal খোলা রাখতে হবে। Android-এ Termux-কে battery optimization থেকে বাদ দিতে হতে পারে, না হলে Android background-এ server বন্ধ করে দিতে পারে।

## Cloud sync সম্পর্কে জরুরি কথা
- প্রথমবার POS-এর localhost address-এ Internet থাকা অবস্থায় login/load করা জরুরি। Firebase account-কে localhost origin-এও sign-in করতে হতে পারে; live website-এর login session localhost-এ সবসময় স্বয়ংক্রিয়ভাবে আসে না।
- Internet ফেরার পর Cloud sync কাজ করার জন্য Firebase SDK পৌঁছানো এবং Firebase rules অনুমতি দেওয়া দরকার। POS-এর `index.html` পেজ খোলা রাখুন; sync এই পেজ চালায়। পেজ বন্ধ থাকলে পরে পেজ আবার খুললে sync চেষ্টা করবে। sync ব্যর্থ হলে data `local-data/orders.json` / `local-data/ratings.json`-এ থাকবে; QR Orders panel-এ sync বাকি থাকলে তা দেখাবে।
- Local server থেকে Cloud-এ upload-এর চেষ্টা আছে; তবে এই package Cloud service-এ সফল upload হয়েছে কিনা আপনার Firebase project-এর rules/account দিয়ে বাস্তবে পরীক্ষা করা হয়নি। প্রথমে test order দিয়ে যাচাই করুন।
- POS sales (সাধারণ counter sale) এবং QR customer orders আলাদা: এই offline server QR orders/menu/ratings sync করে; সাধারণ POS sales-এর Firebase sync মূল অ্যাপের নিজস্ব ব্যবস্থার ওপর নির্ভর করে।
- Cloud sync সম্ভব না হলেও local QR order local server-এ থাকে। `local-data` folder delete করবেন না।
- QR order panel/local customer page-এর local mode `HTTP port 8080`-তে কাজ করে। অন্য port নিলে code-এর LOCAL detection-ও বদলাতে হবে।
