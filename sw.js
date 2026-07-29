const CACHE="group-d-6m-complete-v12-13-visibility-controls";
const ASSETS=["./","./index.html","./l4x8m2r7-k9v3t5n1-z6c4p8q2.html","./q9v3x7k2-r8m4p6t1-z5n7c2w9.html","./r6p1w9k4-z8x2m7q5-v3n6c1t9.html","./admin-recovery.js","./s4n8v2k7-r1p6x9m3-c5t8q4z2.html","./student-recovery.js","./m7q2t9v4-x8k5r3p6-n1z7c4l8.html","./styles.css","./config.js","./common.js","./student.js","./admin.js","./test.js","./final-fix.js","./manifest.webmanifest","./favicon.png","./apple-touch-icon.png","./icon-192.png","./icon-512.png","./cbt-mock-test.html","./cbt-mock-test.js","./cbt-mock-test.css","./cbt-admin.html","./cbt-logo.webp","./cbt-preview-banner.png"];
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
