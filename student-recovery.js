const studentRecoverySb=window.supabase.createClient(
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

const STUDENT_LOGIN_PAGE='index.html';
let studentRecoveryReady=false;

function studentRecoveryMessage(text,type='error'){
  const host=document.getElementById('studentRecoveryMessage');
  if(!host)return;
  host.innerHTML=text?`<div class="notice notice-${type}">${String(text).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}</div>`:'';
}

function recoveryErrorText(error){
  const message=String(error?.message||error||'').trim();
  const lower=message.toLowerCase();
  if(lower.includes('expired')||lower.includes('invalid')||lower.includes('otp_expired'))return 'Reset Link expire या पहले इस्तेमाल हो चुका है। Login Page से नया Reset Link भेजें।';
  if(lower.includes('code verifier')||lower.includes('oauth')||lower.includes('session missing')||lower.includes('token missing'))return 'Reset Email में secure token नहीं मिला। Supabase का Reset Password Email Template एक बार सही करना जरूरी है।';
  return message||'Reset Link verify नहीं हो पाया। नया link मंगवाएँ।';
}

function showStudentRecoveryForm(){
  studentRecoveryReady=true;
  document.getElementById('studentRecoveryWaiting')?.classList.add('hidden');
  document.getElementById('studentRecoveryForm')?.classList.remove('hidden');
  studentRecoveryMessage('Reset Link verified है। अब नया Password सेट करें।','success');
}

async function verifyStudentRole(){
  const {data:{user},error:userError}=await studentRecoverySb.auth.getUser();
  if(userError||!user)throw userError||new Error('Student account verify नहीं हुआ।');
  const {data:profile,error:profileError}=await studentRecoverySb
    .from('profiles')
    .select('role,email')
    .eq('id',user.id)
    .maybeSingle();
  if(profileError)throw profileError;
  if(String(profile?.role||'student').toLowerCase()==='admin'){
    await studentRecoverySb.auth.signOut({scope:'local'}).catch(()=>{});
    throw new Error('यह Admin account है। Unique Admin Panel से Password Reset करें।');
  }
}

async function setExplicitSession(session){
  if(!session?.access_token||!session?.refresh_token)throw new Error('Auth session missing');
  const {error}=await studentRecoverySb.auth.setSession({
    access_token:session.access_token,
    refresh_token:session.refresh_token
  });
  if(error)throw error;
}

function parseHash(){
  return new URLSearchParams(location.hash.replace(/^#/,''));
}

async function establishStudentRecoverySession(){
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
    const {data,error}=await studentRecoverySb.auth.verifyOtp({token_hash:tokenHash,type:'recovery'});
    if(error)throw error;
    if(data?.session)await setExplicitSession(data.session);
  }else if(accessToken && refreshToken && hashType==='recovery'){
    await setExplicitSession({access_token:accessToken,refresh_token:refreshToken});
  }else if(authCode){
    const {data,error}=await studentRecoverySb.auth.exchangeCodeForSession(authCode);
    if(error)throw error;
    if(data?.session)await setExplicitSession(data.session);
  }

  // Supabase client may have already processed the implicit recovery fragment.
  let {data:{session}}=await studentRecoverySb.auth.getSession();
  if(!session){
    await new Promise(resolve=>setTimeout(resolve,450));
    ({data:{session}}=await studentRecoverySb.auth.getSession());
  }
  if(!session)throw new Error('Auth session missing');

  await verifyStudentRole();
  history.replaceState(null,'',location.pathname);
  showStudentRecoveryForm();
}

studentRecoverySb.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY' && session && !studentRecoveryReady){
    verifyStudentRole().then(()=>{
      history.replaceState(null,'',location.pathname);
      showStudentRecoveryForm();
    }).catch(error=>studentRecoveryMessage(recoveryErrorText(error)));
  }
});

(async function initStudentRecovery(){
  try{
    await establishStudentRecoverySession();
  }catch(error){
    if(studentRecoveryReady)return;
    document.getElementById('studentRecoveryWaiting')?.classList.add('hidden');
    studentRecoveryMessage(recoveryErrorText(error));
  }
})();

async function saveStudentRecoveryPassword(){
  const p1=document.getElementById('studentNewPassword')?.value||'';
  const p2=document.getElementById('studentNewPassword2')?.value||'';
  if(p1.length<8)return studentRecoveryMessage('Password कम से कम 6 अक्षर का रखें।');
  if(p1!==p2)return studentRecoveryMessage('दोनों Password एक जैसे नहीं हैं।');
  const btn=document.getElementById('studentRecoverySaveButton');
  if(btn){btn.disabled=true;btn.textContent='Updating…'}
  try{
    const {data:{session}}=await studentRecoverySb.auth.getSession();
    if(!session)throw new Error('Auth session missing');
    const {error}=await studentRecoverySb.auth.updateUser({password:p1});
    if(error)throw error;
    studentRecoveryMessage('Password सफलतापूर्वक बदल गया। Login Page खुल रहा है…','success');
    await studentRecoverySb.auth.signOut({scope:'local'}).catch(()=>{});
    setTimeout(()=>location.replace(STUDENT_LOGIN_PAGE),900);
  }catch(error){
    studentRecoveryMessage(recoveryErrorText(error));
    if(btn){btn.disabled=false;btn.textContent='Update Password'}
  }
}
window.saveStudentRecoveryPassword=saveStudentRecoveryPassword;
