var V='musafir-pos-v8';
var CORE=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
var CDN=['https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js','https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){
 return Promise.all(CORE.map(function(u){return c.add(u).catch(function(){})}).concat(CDN.map(function(u){return c.add(u).catch(function(){})})))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==V}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
 var r=e.request;if(r.method!=='GET')return;var u=new URL(r.url);
 var ok=u.origin===location.origin||u.host==='www.gstatic.com'||u.host==='fonts.gstatic.com'||u.host==='fonts.googleapis.com';
 if(!ok)return;
 if(r.mode==='navigate'){
  e.respondWith(new Promise(function(res){
   var done=false,tm=setTimeout(function(){caches.match('./index.html',{ignoreSearch:true}).then(function(h){if(h&&!done){done=true;res(h)}})},4000);
   fetch(r).then(function(n){clearTimeout(tm);if(done)return;done=true;var cp=n.clone();caches.open(V).then(function(c){c.put('./index.html',cp)});res(n)})
   .catch(function(){clearTimeout(tm);caches.match('./index.html',{ignoreSearch:true}).then(function(h){if(!done){done=true;res(h||Response.error())}})})}));
  return}
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
  var net=fetch(r).then(function(n){if(n&&(n.ok||n.type==='opaque')){var cp=n.clone();caches.open(V).then(function(c){c.put(r,cp)})}return n}).catch(function(){return hit});
  return hit||net}))});
