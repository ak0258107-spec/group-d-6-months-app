const CACHE="group-d-6m-admin-direct-login-v3";
const ASSETS=["./","./index.html","./student.html","./owner-control-gk-7x29.html","./test.html","./styles.css","./config.js","./common.js","./student.js","./admin.js","./test.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
