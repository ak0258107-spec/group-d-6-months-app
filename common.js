const sb = window.supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_PUBLISHABLE_KEY);

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
async function registerSW(){if("serviceWorker" in navigator){try{await navigator.serviceWorker.register("./sw.js")}catch(e){console.warn(e)}}}
window.sb=sb;window.requireAuth=requireAuth;window.getProfile=getProfile;window.esc=esc;window.fmtDate=fmtDate;window.toast=toast;window.logout=logout;window.registerSW=registerSW;window.normalizeIndianPhone=normalizeIndianPhone;window.phoneToAuthEmail=phoneToAuthEmail;

/* ===== PWA INSTALL SYSTEM ===== */
let __deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();
  __deferredInstallPrompt=e;
  document.querySelectorAll('[id$="InstallBtn"]').forEach(b=>b.classList.remove('hidden'));
});
window.addEventListener('appinstalled',()=>{
  __deferredInstallPrompt=null;
  document.querySelectorAll('[id$="InstallBtn"]').forEach(b=>b.classList.add('hidden'));
});
function initInstallUI(id){
  const btn=document.getElementById(id);
  if(!btn)return;
  const standalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  if(standalone)btn.classList.add('hidden');
}
async function installApp(){
  if(__deferredInstallPrompt){
    __deferredInstallPrompt.prompt();
    await __deferredInstallPrompt.userChoice;
    __deferredInstallPrompt=null;
    document.querySelectorAll('[id$="InstallBtn"]').forEach(b=>b.classList.add('hidden'));
    return;
  }
  toast('Browser menu में “Install app” या “Add to Home screen” चुनें।','success');
}

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
