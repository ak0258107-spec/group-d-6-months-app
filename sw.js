const CACHE="group-d-6m-complete-v5-reset-link-opaque-routes";
const ASSETS=["./","./index.html","./l4x8m2r7-k9v3t5n1-z6c4p8q2.html","./q9v3x7k2-r8m4p6t1-z5n7c2w9.html","./m7q2t9v4-x8k5r3p6-n1z7c4l8.html","./styles.css","./config.js","./common.js","./student.js","./admin.js","./test.js","./final-fix.js","./manifest.webmanifest","./favicon.png","./apple-touch-icon.png","./icon-192.png","./icon-512.png"];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener("activate",event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(cached=>cached||caches.match("./index.html"))));
});
