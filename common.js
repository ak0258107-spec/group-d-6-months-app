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
