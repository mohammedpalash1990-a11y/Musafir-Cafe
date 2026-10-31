var V='musafir-supermarket-v39';
var CORE=['./','./index.html','./manifest.json','./logo-192.png','./logo-512.png','./favicon-32.png','./wait.jpg','./ready.jpg','./served.jpg'];
var VID=['./wait.mp4','./ready.mp4','./served.mp4'];
var FB='https://www.gstatic.com/firebasejs/10.12.2/';
var CDN=[FB+'firebase-app.js',FB+'firebase-auth.js',FB+'firebase-firestore.js',FB+'firebase-component.js',FB+'firebase-logger.js',FB+'firebase-util.js','https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;600;800&display=swap'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){
 var core=CORE.map(function(u){return fetch(new Request(u,{cache:'reload'})).then(function(r){if(r&&r.ok)return c.put(u,r)}).catch(function(){})});
 var vid=VID.map(function(u){return fetch(new Request(u,{cache:'reload'})).then(function(r){if(r&&r.ok&&r.status===200)return c.put(u,r)}).catch(function(){})});
 var cdn=CDN.map(function(u){return c.add(u).catch(function(){})});
 return Promise.all(core.concat(vid,cdn))}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==V}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});

/* ভিডিও: পুরো ফাইল ক্যাশে রাখা হয় এবং Range অনুরোধে ক্যাশ থেকেই অফলাইনে চালানো হয় */
function vid(r){
 return caches.open(V).then(function(c){
  return c.match(r.url,{ignoreSearch:true}).then(function(hit){
   var get=hit?Promise.resolve(hit):fetch(r.url).then(function(n){if(n&&n.ok&&n.status===200){c.put(r.url,n.clone())}return n});
   return get.then(function(res){
    var rg=r.headers.get('range');
    if(!rg||!res||!res.ok||res.status!==200)return res;
    return res.clone().arrayBuffer().then(function(buf){
     var m=/bytes=(\d*)-(\d*)/.exec(rg),len=buf.byteLength,s=0,e=len-1;
     if(m){if(m[1]!==''){s=+m[1];if(m[2]!=='')e=Math.min(+m[2],len-1)}else if(m[2]!==''){s=Math.max(0,len-(+m[2]))}}
     if(s>e||s>=len)return new Response(null,{status:416,headers:{'Content-Range':'bytes */'+len}});
     return new Response(buf.slice(s,e+1),{status:206,statusText:'Partial Content',headers:{'Content-Type':res.headers.get('Content-Type')||'video/mp4','Content-Range':'bytes '+s+'-'+e+'/'+len,'Content-Length':String(e-s+1),'Accept-Ranges':'bytes'}})})})})
 }).catch(function(){return Response.error()})}

self.addEventListener('fetch',function(e){
 var r=e.request;if(r.method!=='GET')return;var u=new URL(r.url);var NAV=/order\.html$/.test(u.pathname)?'./order.html':'./index.html';
 var ok=u.origin===location.origin||u.host==='www.gstatic.com'||u.host==='fonts.gstatic.com'||u.host==='fonts.googleapis.com';
 if(!ok)return;
 if(u.origin===location.origin&&/\.(mp4|webm)$/.test(u.pathname)){e.respondWith(vid(r));return}
 function swr(key,req){return caches.match(key,{ignoreSearch:true}).then(function(hit){
  var net=fetch(req,{cache:'reload'}).then(function(n){if(n&&n.ok){var cp=n.clone();caches.open(V).then(function(c){c.put(key,cp)})}return n}).catch(function(){return null});
  if(hit){e.waitUntil(net);return hit}
  return net.then(function(n){return n||Response.error()})})}
 if(r.mode==='navigate'){e.respondWith(swr(NAV,r.url));return}
 if(u.origin===location.origin&&/\.(html|js|json)$/.test(u.pathname)){e.respondWith(swr(r,r.url));return}
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(function(hit){
  var net=fetch(r).then(function(n){if(n&&(n.ok||n.type==='opaque')){var cp=n.clone();caches.open(V).then(function(c){c.put(r,cp)})}return n}).catch(function(){return hit});
  return hit||net}))});

self.addEventListener('notificationclick',function(e){e.notification.close();e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(function(l){for(var i=0;i<l.length;i++){if('focus' in l[i])return l[i].focus()}return clients.openWindow('./')}))});
