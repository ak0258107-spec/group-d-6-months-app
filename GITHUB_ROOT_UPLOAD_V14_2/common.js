const sb = window.supabase.createClient(
  APP_CONFIG.SUPABASE_URL,
  APP_CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {
    auth:{
      flowType:'implicit',
      detectSessionInUrl:true,
      persistSession:true,
      autoRefreshToken:true
    }
  }
);

async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = "index.html"; return null; }
  return session.user;
}
async function getProfile(id) {
  const { data } = await sb.from("profiles").select("*").eq("id", id).maybeSingle();
  return data || null;
}
function esc(s=""){return String(s).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmtDate(s){try{return new Date(s+"T00:00:00").toLocaleDateString("hi-IN",{day:"2-digit",month:"short",year:"numeric"})}catch{return s}}
function toast(message, type="info"){
  const el=document.createElement("div");el.className=`notice notice-${type}`;el.textContent=message;
  document.body.prepend(el);setTimeout(()=>el.remove(),3500);
}

function normalizeIndianPhone(raw=""){
  const digits=String(raw).replace(/\D/g,"");
  if(digits.length===10)return "+91"+digits;
  if(digits.length===12&&digits.startsWith("91"))return "+"+digits;
  if(digits.length===11&&digits.startsWith("0"))return "+91"+digits.slice(1);
  return null;
}
function phoneToAuthEmail(phone){
  const normalized=normalizeIndianPhone(phone);
  if(!normalized)return null;
  return normalized.replace("+","")+"@groupd90.local";
}

async function logout(){await sb.auth.signOut();location.href="index.html"}
async function registerSW(){if("serviceWorker" in navigator){try{return await navigator.serviceWorker.register("./sw.js")}catch(e){console.warn(e)}}return null}
window.sb=sb;window.requireAuth=requireAuth;window.getProfile=getProfile;window.esc=esc;window.fmtDate=fmtDate;window.toast=toast;window.logout=logout;window.registerSW=registerSW;window.normalizeIndianPhone=normalizeIndianPhone;window.phoneToAuthEmail=phoneToAuthEmail;

/* ===== PWA INSTALL SYSTEM ===== */
let __deferredInstallPrompt=null;
function isStandaloneApp(){
  return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true||document.referrer.startsWith('android-app://')||localStorage.getItem('gk_pwa_installed')==='1';
}
function refreshInstallButtons(){
  const installed=isStandaloneApp();
  document.querySelectorAll('[id$="InstallBtn"]').forEach(btn=>btn.classList.toggle('hidden',installed));
}
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();
  localStorage.removeItem('gk_pwa_installed');
  __deferredInstallPrompt=event;
  refreshInstallButtons();
});
window.addEventListener('appinstalled',()=>{
  localStorage.setItem('gk_pwa_installed','1');
  __deferredInstallPrompt=null;
  document.querySelectorAll('[id$="InstallBtn"]').forEach(btn=>btn.classList.add('hidden'));
});
try{window.matchMedia('(display-mode: standalone)').addEventListener('change',refreshInstallButtons)}catch(_){ }
async function initInstallUI(id){
  const btn=document.getElementById(id);
  if(!btn)return;
  refreshInstallButtons();
  if('getInstalledRelatedApps' in navigator){
    try{
      const apps=await navigator.getInstalledRelatedApps();
      if(Array.isArray(apps)&&apps.length){localStorage.setItem('gk_pwa_installed','1');btn.classList.add('hidden')}
    }catch(_){ }
  }
}
async function installApp(){
  if(isStandaloneApp()){refreshInstallButtons();return}
  if(__deferredInstallPrompt){
    __deferredInstallPrompt.prompt();
    const choice=await __deferredInstallPrompt.userChoice.catch(()=>({outcome:'dismissed'}));
    if(choice?.outcome==='accepted'){
      localStorage.setItem('gk_pwa_installed','1');
      __deferredInstallPrompt=null;
      document.querySelectorAll('[id$="InstallBtn"]').forEach(btn=>btn.classList.add('hidden'));
      return;
    }
    refreshInstallButtons();
    return;
  }
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  toast(isiOS?'Safari में Share दबाकर “Add to Home Screen” चुनें।':'Browser menu में “Install app” या “Add to Home screen” चुनें।','success');
}

/* ===== PUSH NOTIFICATION SYSTEM ===== */
function pushApiBase(){return String(APP_CONFIG.PUSH_NOTIFICATION_API_URL||'').replace(/\/+$/,'')}
function base64UrlToUint8Array(value=''){
  const padding='='.repeat((4-value.length%4)%4);
  const raw=atob((value+padding).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
}
async function currentAccessToken(){
  const {data:{session}}=await sb.auth.getSession();
  return session?.access_token||'';
}
async function pushApiFetch(path,options={}){
  const base=pushApiBase();
  if(!base)throw new Error('Push Notification API URL missing');
  const token=await currentAccessToken();
  const headers=new Headers(options.headers||{});
  if(token)headers.set('Authorization','Bearer '+token);
  if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  return fetch(base+path,{...options,headers});
}
async function savePushSubscription(registration){
  const subscription=await registration.pushManager.getSubscription();
  if(!subscription)return false;
  const response=await pushApiFetch('/api/subscribe',{method:'POST',body:JSON.stringify({subscription:subscription.toJSON(),userAgent:navigator.userAgent})});
  if(!response.ok)throw new Error((await response.json().catch(()=>({})))?.error||'Push subscription save failed');
  localStorage.setItem('gk_push_subscription_saved','1');
  return true;
}
async function enablePushNotifications(options={}){
  const silent=options?.silent===true;
  if(!('Notification' in window)||!('serviceWorker' in navigator)||!('PushManager' in window)){
    if(!silent)toast('इस Browser में Push Notification support नहीं है।','error');
    return false;
  }
  let permission=Notification.permission;
  if(permission==='default'&&!silent)permission=await Notification.requestPermission();
  if(permission!=='granted'){
    if(!silent&&permission==='denied')toast('Notification Browser settings में Block है। उसे Allow करें।','error');
    return false;
  }
  try{
    const registration=await navigator.serviceWorker.ready;
    let subscription=await registration.pushManager.getSubscription();
    if(!subscription){
      const keyResponse=await pushApiFetch('/api/vapid-public-key');
      const keyData=await keyResponse.json().catch(()=>({}));
      if(!keyResponse.ok||!keyData.publicKey)throw new Error(keyData.error||'VAPID public key नहीं मिली');
      subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64UrlToUint8Array(keyData.publicKey)});
    }
    await savePushSubscription(registration);
    if(!silent)toast('Notifications चालू हो गए।','success');
    return true;
  }catch(error){
    console.warn('Push notification setup:',error);
    if(!silent)toast(error.message||'Notifications चालू नहीं हो पाए।','error');
    return false;
  }
}
async function initPushNotifications(){
  if(!pushApiBase()||!('Notification' in window))return;
  if(Notification.permission==='granted'){
    await enablePushNotifications({silent:true});
    return;
  }
  if(Notification.permission==='default'&&!localStorage.getItem('gk_push_prompt_dismissed')){
    setTimeout(()=>showActionNotice('नई CBT Test और Haryana GK Class की सूचना पाने के लिए Notifications चालू करें।','Notifications चालू करें',async()=>{const ok=await enablePushNotifications();if(!ok)localStorage.setItem('gk_push_prompt_dismissed','1')},'info'),1000);
  }
}
function notificationDestination(relatedType=''){
  const page='./l4x8m2r7-k9v3t5n1-z6c4p8q2.html';
  const tabs={test:'cbt',mock:'cbt',question:'cbt',cbt:'cbt',class:'classes',youtube:'classes',revision:'revision'};
  return `${page}?tab=${tabs[String(relatedType||'').toLowerCase()]||'home'}`;
}
async function sendPushNotification(title,message,relatedType='',notificationId=null,relatedId=''){
  try{
    const response=await pushApiFetch('/api/send',{method:'POST',body:JSON.stringify({title,message,url:notificationDestination(relatedType),tag:`gk-${relatedType||'update'}-${relatedId||notificationId||'all'}`,notificationId})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Push send failed');
    return {ok:true,data};
  }catch(error){console.warn('Push send:',error);return {ok:false,error}}
}
window.isStandaloneApp=isStandaloneApp;
window.refreshInstallButtons=refreshInstallButtons;
window.enablePushNotifications=enablePushNotifications;
window.initPushNotifications=initPushNotifications;
window.sendPushNotification=sendPushNotification;
window.notificationDestination=notificationDestination;

/* ===== PREMIUM ACTION NOTICE ===== */
function showActionNotice(message, actionLabel='', actionFn=null, type='warning'){
  let host=document.getElementById('globalActionNoticeHost');
  if(!host){
    host=document.createElement('div');
    host.id='globalActionNoticeHost';
    host.className='global-action-notice-host';
    document.body.appendChild(host);
  }
  host.innerHTML='';
  const card=document.createElement('div');
  card.className='global-action-notice '+type;
  const text=document.createElement('div');
  text.className='global-action-notice-text';
  text.textContent=message;
  card.appendChild(text);
  if(actionLabel && actionFn){
    const btn=document.createElement('button');
    btn.className='btn btn-blue global-action-notice-btn';
    btn.textContent=actionLabel;
    btn.onclick=()=>{ actionFn(); host.innerHTML=''; };
    card.appendChild(btn);
  }
  const close=document.createElement('button');
  close.className='global-action-notice-close';
  close.textContent='✕';
  close.onclick=()=>host.innerHTML='';
  card.appendChild(close);
  host.appendChild(card);
}


/* ===== CLOUDFLARE R2 PDF API ===== */
async function getAccessToken(){
  const {data:{session}}=await sb.auth.getSession();
  return session?.access_token||null;
}
function isR2PdfPath(path){
  return String(path||'').startsWith('pdfs/');
}
async function r2ApiFetch(path,options={}){
  const token=await getAccessToken();
  if(!token)throw new Error('Login required');
  const base=String(APP_CONFIG.R2_PDF_API_URL||'').replace(/\/+$/,'');
  if(!base)throw new Error('R2 PDF API URL missing');
  const headers=new Headers(options.headers||{});
  headers.set('Authorization',`Bearer ${token}`);
  return fetch(base+path,{...options,headers});
}
async function r2ErrorMessage(response,fallback='Request failed'){
  try{
    const data=await response.json();
    return data?.error||fallback;
  }catch{
    return fallback;
  }
}
window.r2ApiFetch=r2ApiFetch;
window.isR2PdfPath=isR2PdfPath;
