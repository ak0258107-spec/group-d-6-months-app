const CACHE="group-d-6m-v12-29-hindi-filename-pdf-upload-fix";
const ASSETS=[
  "./","./index.html","./l4x8m2r7-k9v3t5n1-z6c4p8q2.html","./q9v3x7k2-r8m4p6t1-z5n7c2w9.html",
  "./r6p1w9k4-z8x2m7q5-v3n6c1t9.html","./admin-recovery.js","./s4n8v2k7-r1p6x9m3-c5t8q4z2.html","./student-recovery.js",
  "./styles.css","./simple-v1220.css","./config.js","./common.js","./student.js","./admin.js","./avatar-boy.svg","./avatar-girl.svg","./avatar-student.svg",
  "./manifest.json","./manifest.webmanifest","./favicon.png","./apple-touch-icon.png","./icon-192.png","./icon-512.png",
  "./cbt-mock-test.css","./cbt-admin.html","./cbt-exam-v12-26.html","./cbt-student-v12-26.js","./cbt-topics-data.js","./cbt-logo.webp","./cbt-preview-banner.png"
];
self.addEventListener("install",event=>{self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)))});
self.addEventListener("activate",event=>event.waitUntil(Promise.all([
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
  self.clients.claim()
])));
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  const isCode=/\.(?:html|js|css)$/i.test(url.pathname);
  if(isCode){
    event.respondWith(fetch(new Request(event.request,{cache:"no-store"})).then(response=>{
      if(response&&response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
      return response;
    }).catch(async()=>{
      const cached=await caches.match(event.request,{ignoreSearch:true});
      if(cached)return cached;
      if(event.request.mode==="navigate")return caches.match("./index.html");
      return new Response("File unavailable",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
    }));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response&&response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
    return response;
  })));
});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch(_){data={message:event.data?.text?.()||'नई जानकारी उपलब्ध है।'}}
  const title=data.title||'GK BY PURUSHOTAM SIR';
  const options={body:data.message||'नई जानकारी उपलब्ध है।',icon:'./icon-192.png',badge:'./favicon.png',tag:data.tag||'gk-update',renotify:true,requireInteraction:false,data:{url:data.url||'./l4x8m2r7-k9v3t5n1-z6c4p8q2.html?tab=notifications',notificationId:data.notificationId||null}};
  event.waitUntil(Promise.all([self.registration.showNotification(title,options),self.clients.matchAll({type:'window',includeUncontrolled:true}).then(clients=>Promise.all(clients.map(client=>client.postMessage({type:'PUSH_NOTIFICATION_RECEIVED',notificationId:data.notificationId||null}))))]));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const raw=event.notification?.data?.url||'./l4x8m2r7-k9v3t5n1-z6c4p8q2.html?tab=notifications';
  const targetUrl=new URL(raw,self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
    for(const client of clients){if('focus' in client){await client.focus();if('navigate' in client)await client.navigate(targetUrl);return}}
    if(self.clients.openWindow)return self.clients.openWindow(targetUrl);
  }));
});
