const adminRecoverySb=window.supabase.createClient(
  APP_CONFIG.SUPABASE_URL,
  APP_CONFIG.SUPABASE_PUBLISHABLE_KEY,
  {auth:{detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}}
);

const ADMIN_LOGIN_PAGE='q9v3x7k2-r8m4p6t1-z5n7c2w9.html';
let adminRecoveryReady=false;

function adminRecoveryMessage(text,type='error'){
  const host=document.getElementById('adminRecoveryMessage');
  if(!host)return;
  host.innerHTML=text?`<div class="notice notice-${type}">${String(text).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}</div>`:'';
}

function showAdminRecoveryForm(){
  adminRecoveryReady=true;
  document.getElementById('adminRecoveryWaiting')?.classList.add('hidden');
  document.getElementById('adminRecoveryForm')?.classList.remove('hidden');
  adminRecoveryMessage('Reset link verified है। नया Admin Password सेट करें।','success');
}

adminRecoverySb.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY' && session)showAdminRecoveryForm();
});

(async function initAdminRecovery(){
  const requested=new URLSearchParams(location.search).get('mode')==='recovery'
    || location.hash.includes('type=recovery')
    || location.search.includes('type=recovery');
  if(!requested){
    document.getElementById('adminRecoveryWaiting')?.classList.add('hidden');
    adminRecoveryMessage('यह सुरक्षित पेज केवल Admin Reset Email के link से खुलता है।');
    return;
  }
  const {data:{session}}=await adminRecoverySb.auth.getSession();
  if(session){showAdminRecoveryForm();return;}
  setTimeout(async()=>{
    if(adminRecoveryReady)return;
    const {data:{session:lateSession}}=await adminRecoverySb.auth.getSession();
    if(lateSession){showAdminRecoveryForm();return;}
    document.getElementById('adminRecoveryWaiting')?.classList.add('hidden');
    adminRecoveryMessage('Reset link invalid या expire हो चुका है। Admin Panel से नया link भेजें।');
  },1800);
})();

async function saveAdminRecoveryPassword(){
  const p1=document.getElementById('adminNewPassword')?.value||'';
  const p2=document.getElementById('adminNewPassword2')?.value||'';
  if(p1.length<6)return adminRecoveryMessage('Password कम से कम 6 अक्षर का रखें।');
  if(p1!==p2)return adminRecoveryMessage('दोनों Password एक जैसे नहीं हैं।');
  const btn=document.getElementById('adminRecoverySaveButton');
  if(btn){btn.disabled=true;btn.textContent='Updating…'}
  try{
    const {data:{session}}=await adminRecoverySb.auth.getSession();
    if(!session)throw new Error('Reset session expire हो चुका है। नया link मंगवाएँ।');
    const {error}=await adminRecoverySb.auth.updateUser({password:p1});
    if(error)throw error;
    adminRecoveryMessage('Admin Password बदल गया। Secure Admin Login खुल रहा है…','success');
    await adminRecoverySb.auth.signOut({scope:'local'});
    history.replaceState(null,'',new URL(ADMIN_LOGIN_PAGE,location.href).pathname);
    setTimeout(()=>location.replace(ADMIN_LOGIN_PAGE),900);
  }catch(e){
    adminRecoveryMessage(e.message||'Password update नहीं हो पाया।');
    if(btn){btn.disabled=false;btn.textContent='Update Password Securely'}
  }
}
window.saveAdminRecoveryPassword=saveAdminRecoveryPassword;
