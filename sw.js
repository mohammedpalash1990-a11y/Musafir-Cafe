var V='musafir-pos-v17';
var CORE=['./','./index.html','./order.html','./manifest.json','./logo-192.png','./logo-512.png','./favicon-32.png'];
var CDN=['https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js','https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){
 var core=CORE.map(function(u){return fetch(new Request(u,{cache:'reload'})).then(function(r){if(r&&r.ok)return c.put(u,r)}).catch(function(){})});
 var cdn=CDN.map(function(u){return c.add(u).catch(function(){})});
 return Promise.all(core.concat(cdn))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==V}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){
 var r=e.request;if(r.method!=='GET')return;var u=new URL(r.url);var NAV=/order\.html$/.test(u.pathname)?'./order.html':'./index.html';
 var ok=u.origin===location.origin||u.host==='www.gstatic.com'||u.host==='fonts.gstatic.com'||u.host==='fonts.googleapis.com';
 if(!ok)return;
 if(r.mode==='navigate'){
  e.respondWith(new Promise(function(res){
   var done=false,tm=setTimeout(function(){caches.match(NAV,{ignoreSearch:true}).then(function(h){if(h&&!done){done=true;res(h)}})},8000);
   fetch(new Request(r.url,{cache:'reload'})).then(function(n){clearTimeout(tm);if(done)return;done=true;if(n&&n.ok){var cp=n.clone();caches.open(V).then(function(c){c.put(NAV,cp)})}res(n)})
   .catch(function(){clearTimeout(tm);caches.match(NAV,{ignoreSearch:true}).then(function(h){if(!done){done=true;res(h||Response.error())}})})}));
  return}
 if(u.origin===location.origin&&/\.(html|js|json)$/.test(u.pathname)){
  e.respondWith(fetch(new Request(r.url,{cache:'reload'})).then(function(n){if(n&&n.ok){var cp=n.clone();caches.open(V).then(function(c){c.put(r,cp)})}return n}).catch(function(){return caches.match(r,{ignoreSearch:true})}));
  return}
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
  var net=fetch(r).then(function(n){if(n&&(n.ok||n.type==='opaque')){var cp=n.clone();caches.open(V).then(function(c){c.put(r,cp)})}return n}).catch(function(){return hit});
  return hit||net}))});

self.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){for(var i=0;i<l.length;i++){if('focus' in l[i])return l[i].focus()}return clients.openWindow('./')}))});
