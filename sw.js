const CACHE="group-d-6m-final-welcome-totp-v3";
const ASSETS=["./","./index.html","./student.html","./gk-portal-x9q7m2v4k8r6-auth-3p5n1c7d.html","./test.html","./styles.css","./config.js","./common.js","./student.js","./admin.js","./test.js","./manifest.webmanifest"];
self.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
