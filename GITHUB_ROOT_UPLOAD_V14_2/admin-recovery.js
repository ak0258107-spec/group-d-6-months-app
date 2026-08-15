const adminRecoverySb=window.supabase.createClient(
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

const ADMIN_LOGIN_PAGE='q9v3x7k2-r8m4p6t1-z5n7c2w9.html';
let adminRecoveryReady=false;

function adminRecoveryMessage(text,type='error'){
  const host=document.getElementById('adminRecoveryMessage');
  if(!host)return;
  host.innerHTML=text?`<div class="notice notice-${type}">${String(text).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}</div>`:'';
}

function recoveryErrorText(error){
  const message=String(error?.message||error||'').trim();
  const lower=message.toLowerCase();
  if(lower.includes('expired')||lower.includes('invalid')||lower.includes('otp_expired'))return 'Reset Link expire या पहले इस्तेमाल हो चुका है। Admin Panel से नया Reset Link भेजें।';
  if(lower.includes('code verifier')||lower.includes('oauth')||lower.includes('session missing')||lower.includes('token missing'))return 'Reset Email में secure token नहीं मिला। Supabase का Reset Password Email Template एक बार सही करना जरूरी है।';
  return message||'Reset Link verify नहीं हो पाया। नया link मंगवाएँ।';
}

function showAdminRecoveryForm(){
  adminRecoveryReady=true;
  document.getElementById('adminRecoveryWaiting')?.classList.add('hidden');
  document.getElementById('adminRecoveryForm')?.classList.remove('hidden');
  adminRecoveryMessage('Admin Reset Link verified है। अब नया Password सेट करें।','success');
}

async function verifyAdminRole(){
  const {data:{user},error:userError}=await adminRecoverySb.auth.getUser();
  if(userError||!user)throw userError||new Error('Admin account verify नहीं हुआ।');
  const {data:profile,error:profileError}=await adminRecoverySb
    .from('profiles')
    .select('role')
    .eq('id',user.id)
    .maybeSingle();
  if(profileError)throw profileError;
  if(String(profile?.role||'').toLowerCase()!=='admin'){
    await adminRecoverySb.auth.signOut({scope:'local'}).catch(()=>{});
    throw new Error('यह Reset Link Admin account का नहीं है। Student Password Reset का उपयोग करें।');
  }
}

async function setExplicitSession(session){
  if(!session?.access_token||!session?.refresh_token)throw new Error('Auth session missing');
  const {error}=await adminRecoverySb.auth.setSession({
    access_token:session.access_token,
    refresh_token:session.refresh_token
  });
  if(error)throw error;
}

function parseHash(){
  return new URLSearchParams(location.hash.replace(/^#/,''));
}

async function establishAdminRecoverySession(){
  const url=new URL(location.href);
  const errorDescription=url.searchParams.get('error_description')||url.searchParams.get('error');
  if(errorDescription)throw new Error(decodeURIComponent(errorDescription.replace(/\+/g,' ')));

  const tokenHash=url.searchParams.get('token_hash');
  const recoveryType=url.searchParams.get('type');
  const authCode=url.searchParams.get('code');
  const hash=parseHash();
  const accessToken=hash.get('access_token');
  const refreshToken=hash.get('refresh_token');
  const hashType=hash.get('type');

  if(tokenHash && recoveryType==='recovery'){
    const {data,error}=await adminRecoverySb.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
    if(error)throw error;
    if(data?.session)await setExplicitSession(data.session);
  }else if(accessToken && refreshToken && hashType==='recovery'){
    await setExplicitSession({access_token:accessToken,refresh_token:refreshToken});
  }else if(authCode){
    const {data,error}=await adminRecoverySb.auth.exchangeCodeForSession(authCode);
    if(error)throw error;
    if(data?.session)await setExplicitSession(data.session);
  }

  // Supabase client may have already processed the implicit recovery fragment.
  let {data:{session}}=await adminRecoverySb.auth.getSession();
  if(!session){
    await new Promise(resolve=>setTimeout(resolve,450));
    ({data:{session}}=await adminRecoverySb.auth.getSession());
  }
  if(!session)throw new Error('Auth session missing');

  await verifyAdminRole();
  history.replaceState(null,'',location.pathname);
  showAdminRecoveryForm();
}

adminRecoverySb.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY' && session && !adminRecoveryReady){
    verifyAdminRole().then(()=>{
      history.replaceState(null,'',location.pathname);
      showAdminRecoveryForm();
    }).catch(error=>adminRecoveryMessage(recoveryErrorText(error)));
  }
});

(async function initAdminRecovery(){
  try{
    await establishAdminRecoverySession();
  }catch(error){
    if(adminRecoveryReady)return;
    document.getElementById('adminRecoveryWaiting')?.classList.add('hidden');
    adminRecoveryMessage(recoveryErrorText(error));
  }
})();

async function saveAdminRecoveryPassword(){
  const p1=document.getElementById('adminNewPassword')?.value||'';
  const p2=document.getElementById('adminNewPassword2')?.value||'';
  if(p1.length<8)return adminRecoveryMessage('Admin Password कम से कम 8 अक्षर का रखें।');
  if(p1!==p2)return adminRecoveryMessage('दोनों Password एक जैसे नहीं हैं।');
  const btn=document.getElementById('adminRecoverySaveButton');
  if(btn){btn.disabled=true;btn.textContent='Updating…'}
  try{
    const {data:{session}}=await adminRecoverySb.auth.getSession();
    if(!session)throw new Error('Auth session missing');
    const {error}=await adminRecoverySb.auth.updateUser({password:p1});
    if(error)throw error;
    adminRecoveryMessage('Admin Password सफलतापूर्वक बदल गया। Secure Admin Login खुल रहा है…','success');
    await adminRecoverySb.auth.signOut({scope:'local'}).catch(()=>{});
    setTimeout(()=>location.replace(ADMIN_LOGIN_PAGE),900);
  }catch(error){
    adminRecoveryMessage(recoveryErrorText(error));
    if(btn){btn.disabled=false;btn.textContent='Update Password Securely'}
  }
}
window.saveAdminRecoveryPassword=saveAdminRecoveryPassword;
