/* ===== ADMIN PASSWORD + ROLE + AUTHENTICATOR MFA SECURITY ===== */
let __adminGateUnlocked=false;
let __adminMfaFactorId='';
let __adminMfaChallengeId='';
let __adminEnrollFactorId='';
let __adminEnrollChallengeId='';
let __adminIdleTimer=null;

function adminGateMessage(text,type='error'){
  const host=document.getElementById('adminGateMessage');
  if(!host)return;
  host.innerHTML=text?`<div class="notice notice-${type}">${esc(text)}</div>`:'';
}
function isAdminLoginEmail(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim())}
function adminShowOnly(stepId){
  ['adminAccountLoginStep','adminMfaEnrollStep','adminMfaChallengeStep','adminForgotStep'].forEach(id=>{
    document.getElementById(id)?.classList.toggle('hidden',id!==stepId);
  });
  document.getElementById('adminForgotOpenButton')?.classList.toggle('hidden',stepId!=='adminAccountLoginStep');
  document.getElementById('adminGateOverlay')?.classList.remove('hidden');
  document.body.classList.add('admin-security-pending');
  document.body.classList.remove('admin-authorized');
}
function showAdminAccountStep(message=''){
  adminShowOnly('adminAccountLoginStep');
  if(message)adminGateMessage(message,'error'); else adminGateMessage('');
}
function showAdminMfaEnrollStep(){adminShowOnly('adminMfaEnrollStep')}
function showAdminMfaChallengeStep(){adminShowOnly('adminMfaChallengeStep')}

async function verifyCurrentAdminSession(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return null;
  let isAdmin=false;
  try{
    const rpc=await sb.rpc('is_admin');
    if(!rpc.error)isAdmin=rpc.data===true;
  }catch(_){ }
  if(!isAdmin){
    const profile=await getProfile(session.user.id);
    isAdmin=String(profile?.role||'').toLowerCase()==='admin';
  }
  if(!isAdmin)return null;
  adminUser=session.user;
  return session.user;
}
async function currentAal(){
  const {data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if(error)return {currentLevel:null,nextLevel:null};
  return data||{currentLevel:null,nextLevel:null};
}
async function listTotpFactors(){
  const {data,error}=await sb.auth.mfa.listFactors();
  if(error)throw error;
  return data?.totp||[];
}
async function startMfaChallenge(factorId){
  const {data,error}=await sb.auth.mfa.challenge({factorId});
  if(error)throw error;
  __adminMfaFactorId=factorId;
  __adminMfaChallengeId=data.id;
  showAdminMfaChallengeStep();
  adminGateMessage('Authenticator App का वर्तमान code लिखें।','success');
}
function freshAdminFactorName(){
  const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
  const rand=(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2)).replace(/-/g,'').slice(0,8);
  return `GK BY PURUSHOTAM SIR OWNER ${stamp}-${rand}`;
}
async function removeUnverifiedAdminFactors(factors=[]){
  for(const factor of factors.filter(item=>String(item?.status||'').toLowerCase()!=='verified')){
    try{await sb.auth.mfa.unenroll({factorId:factor.id})}catch(error){console.warn('Old unverified MFA factor could not be removed yet',factor.id,error)}
  }
}
async function enrollFreshAdminTotp(){
  let lastError=null;
  for(let attempt=0;attempt<2;attempt++){
    const friendlyName=freshAdminFactorName();
    const result=await sb.auth.mfa.enroll({factorType:'totp',friendlyName});
    if(!result.error&&result.data)return result.data;
    lastError=result.error;
    const message=String(result.error?.message||'').toLowerCase();
    if(!message.includes('friendly name')&&!message.includes('already exists')&&!message.includes('factor'))break;
  }
  throw lastError||new Error('Authenticator setup शुरू नहीं हो सका।');
}
async function prepareAdminMfa(){
  const factors=await listTotpFactors();
  const verified=factors.find(f=>String(f?.status||'').toLowerCase()==='verified');
  if(verified)return startMfaChallenge(verified.id);

  // पुराने अधूरे factors हटाने की कोशिश करें। यदि Supabase उन्हें तुरंत न हटाए,
  // तब भी हर नए enrollment के लिए unique friendly name होने से setup रुकता नहीं है।
  await removeUnverifiedAdminFactors(factors);
  const data=await enrollFreshAdminTotp();
  __adminEnrollFactorId=data.id;
  const qr=data.totp?.qr_code||'';
  const secret=data.totp?.secret||'';
  const qrHost=document.getElementById('adminMfaQr');
  if(qrHost){
    qrHost.innerHTML='';
    const img=document.createElement('img');
    img.alt='Authenticator QR Code';img.src=qr;qrHost.appendChild(img);
  }
  const secretHost=document.getElementById('adminMfaSecret');
  if(secretHost)secretHost.textContent=secret;
  const challenge=await sb.auth.mfa.challenge({factorId:data.id});
  if(challenge.error)throw challenge.error;
  __adminEnrollChallengeId=challenge.data.id;
  showAdminMfaEnrollStep();
  adminGateMessage('नया QR बनाया गया है। इसे अपने निजी Authenticator App से scan करके 6-अंकों का code डालें।','success');
}

async function submitAdminAccountLogin(){
  const loginId=document.getElementById('adminLoginId')?.value.trim().toLowerCase()||'';
  const password=document.getElementById('adminLoginPassword')?.value||'';
  const btn=document.getElementById('adminAccountLoginButton');
  if(!isAdminLoginEmail(loginId))return adminGateMessage('Registered Admin Email लिखें।');
  if(password.length<6)return adminGateMessage('Admin Password लिखें।');
  if(btn){btn.disabled=true;btn.textContent='Checking Security...'}
  try{
    await sb.auth.signOut({scope:'local'});
    const result=await sb.auth.signInWithPassword({email:loginId,password});
    if(result.error)throw new Error('Admin Email या Password गलत है।');
    const profile=await getProfile(result.data.user.id);
    if(String(profile?.role||'').toLowerCase()!=='admin'){
      await sb.auth.signOut();throw new Error('यह account Admin नहीं है।');
    }
    adminUser=result.data.user;
    await prepareAdminMfa();
  }catch(e){
    await sb.auth.signOut({scope:'local'}).catch(()=>{});
    showAdminAccountStep();adminGateMessage(e.message||'Admin Login failed.');
  }finally{if(btn){btn.disabled=false;btn.textContent='Secure Login'}}
}

async function verifyAdminMfaEnrollment(){
  const code=String(document.getElementById('adminEnrollCode')?.value||'').replace(/\D/g,'');
  const btn=document.getElementById('adminEnrollButton');
  if(code.length!==6)return adminGateMessage('पूरा 6-अंकों का Authenticator code लिखें।');
  if(btn){btn.disabled=true;btn.textContent='Activating...'}
  try{
    const {data,error}=await sb.auth.mfa.verify({factorId:__adminEnrollFactorId,challengeId:__adminEnrollChallengeId,code});
    if(error||!data)throw new Error('Code गलत है या समय समाप्त हो गया। नया code देखकर दोबारा प्रयास करें।');
    // सफल activation के बाद पुराने अधूरे factors साफ करें।
    try{
      const factors=await listTotpFactors();
      await removeUnverifiedAdminFactors(factors.filter(f=>f.id!==__adminEnrollFactorId));
    }catch(cleanupError){console.warn('MFA cleanup skipped',cleanupError)}
    await authorizeAdminPanel();
  }catch(e){adminGateMessage(e.message||'MFA activate नहीं हुआ।')}
  finally{if(btn){btn.disabled=false;btn.textContent='Verify & Activate MFA'}}
}

async function submitAdminMfaChallenge(){
  const code=String(document.getElementById('adminMfaCode')?.value||'').replace(/\D/g,'');
  const btn=document.getElementById('adminGateButton');
  if(code.length!==6)return adminGateMessage('पूरा 6-अंकों का Authenticator code लिखें।');
  if(btn){btn.disabled=true;btn.textContent='Verifying...'}
  try{
    const {data,error}=await sb.auth.mfa.verify({factorId:__adminMfaFactorId,challengeId:__adminMfaChallengeId,code});
    if(error||!data)throw new Error('Authenticator code गलत है या expire हो चुका है।');
    await authorizeAdminPanel();
  }catch(e){adminGateMessage(e.message||'Access denied')}
  finally{if(btn){btn.disabled=false;btn.textContent='Verify Code & Open Panel'}}
}

async function authorizeAdminPanel(){
  const user=await verifyCurrentAdminSession();
  const aal=await currentAal();
  if(!user||aal.currentLevel!=='aal2')throw new Error('Admin MFA verification पूर्ण नहीं हुई।');
  __adminGateUnlocked=true;
  document.getElementById('adminGateOverlay')?.classList.add('hidden');
  document.body.classList.add('admin-authorized');
  document.body.classList.remove('admin-security-pending');
  adminGateMessage('');
  startAdminIdleProtection();
}

function showAdminForgotPassword(){adminShowOnly('adminForgotStep');adminGateMessage('')}
function cancelAdminForgotPassword(){showAdminAccountStep()}
async function sendAdminRecoveryLink(){
  const email=document.getElementById('adminForgotEmail')?.value.trim().toLowerCase()||'';
  if(!isAdminLoginEmail(email))return adminGateMessage('Registered Admin Email लिखें।');
  try{
    const redirectTo=new URL('r6p1w9k4-z8x2m7q5-v3n6c1t9.html',location.href).href;
    const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo});
    if(error)throw error;
    adminGateMessage('Password Reset Link Admin Email पर भेज दिया गया है। Reset के बाद Authenticator सुरक्षा फिर भी लागू रहेगी।','success');
  }catch(e){adminGateMessage(e.message||'Reset Link नहीं भेजा जा सका।')}
}

async function adminSwitchAccount(){
  clearTimeout(__adminIdleTimer);__adminGateUnlocked=false;
  __adminMfaFactorId='';__adminMfaChallengeId='';__adminEnrollFactorId='';__adminEnrollChallengeId='';
  await sb.auth.signOut({scope:'local'});
  ['adminLoginId','adminLoginPassword','adminMfaCode','adminEnrollCode'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
  showAdminAccountStep();
}

function startAdminIdleProtection(){
  const minutes=Math.max(5,Number(APP_CONFIG.ADMIN_SESSION_IDLE_MINUTES||20));
  const reset=()=>{
    clearTimeout(__adminIdleTimer);
    __adminIdleTimer=setTimeout(async()=>{
      await sb.auth.signOut({scope:'local'});
      location.replace('index.html');
    },minutes*60*1000);
  };
  ['pointerdown','keydown','touchstart','scroll'].forEach(evt=>window.addEventListener(evt,reset,{passive:true}));
  reset();
}

async function guard(){
  const currentAdmin=await verifyCurrentAdminSession();
  if(!currentAdmin){showAdminAccountStep('Admin Email और Password से Login करें।');return false;}
  const aal=await currentAal();
  if(aal.currentLevel==='aal2'){
    await authorizeAdminPanel();return true;
  }
  try{await prepareAdminMfa();}
  catch(e){showAdminAccountStep(e.message||'Authenticator सुरक्षा शुरू नहीं हो सकी।')}
  return new Promise(resolve=>{
    const timer=setInterval(()=>{if(__adminGateUnlocked){clearInterval(timer);resolve(true)}},250);
  });
}

/* =====================================================================
   V12.20 SIMPLE APP — केवल Class, PDFs, CBT, Poster और Announcement
   ===================================================================== */
let adminUser=null,days=[],students=[],classes=[],materials=[],posters=[];
let adminTargetDateKey='';
let adminTargetDateTimer=null;
const ADMIN_TABS=['dashboard','classes','classpdfs','otherpdfs','posters','announcements','students'];

function byId(id){return document.getElementById(id)}
function tab(name,el){
  ADMIN_TABS.forEach(x=>byId(x+'Tab')?.classList.toggle('hidden',x!==name));
  document.querySelectorAll('.simple-sidebar a').forEach(a=>a.classList.remove('active'));
  if(el)el.classList.add('active');
  if(name==='classes')loadClasses();
  if(name==='classpdfs'||name==='otherpdfs')loadMaterials();
  if(name==='posters')loadPosters();
  if(name==='announcements')loadBroadcasts();
  if(name==='students')loadStudents();
}

async function adminConfirmDelete(message){return window.confirm(message)}
function localDateKey(date=new Date()){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
function isoOrNull(value){return value?new Date(value).toISOString():null}
function classDayLabel(row){return `Day ${row.schedule_days?.day_number||'-'} • ${fmtDate(row.schedule_days?.day_date||'')}`}
function classTimeLabel(row){
  if(!row.start_time)return row.class_type==='recorded'?'Recorded Class':'Time not set';
  const [h,m]=String(row.start_time).slice(0,5).split(':').map(Number);
  const dt=new Date();dt.setHours(h,m,0,0);
  return dt.toLocaleTimeString('hi-IN',{hour:'numeric',minute:'2-digit'});
}
function statusLabel(status){return ({scheduled:'Scheduled',live:'Live Now',completed:'Completed',cancelled:'Cancelled',time_changed:'Time Changed',partial:'Time Changed'})[status]||status||'Scheduled'}
function statusClass(status){return status==='live'?'badge-red':status==='completed'?'badge-green':status==='cancelled'?'badge-gray':status==='time_changed'||status==='partial'?'badge-orange':'badge-blue'}
function targetDayDate(row){return String(row?.schedule_days?.day_date||'9999-12-31')}
function targetDayNumber(row){return Number(row?.schedule_days?.day_number||999999)}
function targetOrderNumber(row){return Number(row?.target_order||999)}
function compareTargetRows(a,b){
  return targetDayDate(a).localeCompare(targetDayDate(b))
    ||targetDayNumber(a)-targetDayNumber(b)
    ||targetOrderNumber(a)-targetOrderNumber(b)
    ||String(a?.class_title||a?.topic||'').localeCompare(String(b?.class_title||b?.topic||''),'hi');
}
function rowBelongsToDay(row,day){
  if(!day)return true;
  const rowScheduleId=String(row?.schedule_day_id||'');
  const selectedScheduleId=String(day?.id||'');
  if(rowScheduleId&&selectedScheduleId)return rowScheduleId===selectedScheduleId;
  const rowDate=String(row?.schedule_days?.day_date||'');
  const selectedDate=String(day?.day_date||'');
  if(rowDate&&selectedDate)return rowDate===selectedDate;
  const rowNumber=Number(row?.schedule_days?.day_number);
  const selectedNumber=Number(day?.day_number);
  return Number.isFinite(rowNumber)&&Number.isFinite(selectedNumber)&&rowNumber===selectedNumber;
}
function rowsForScheduleDay(day=selectedScheduleDay()){
  return classes.filter(row=>rowBelongsToDay(row,day)).sort(compareTargetRows);
}
function startAdminTargetDateSync(){
  adminTargetDateKey=localDateKey();
  if(adminTargetDateTimer)clearInterval(adminTargetDateTimer);
  adminTargetDateTimer=setInterval(async()=>{
    const nextKey=localDateKey();
    if(nextKey===adminTargetDateKey)return;
    adminTargetDateKey=nextKey;
    selectSuggestedDay('today',false);
    await loadClasses();
    toast('नई तारीख के अनुसार आज का Target अपने-आप load हो गया।','success');
  },60000);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    const nextKey=localDateKey();
    if(nextKey!==adminTargetDateKey){
      adminTargetDateKey=nextKey;
      selectSuggestedDay('today',false);
      loadClasses();
    }
  });
}

async function init(){
  if(!(await guard()))return;
  adminUser=await requireAuth();
  byId('todayDate').textContent=new Date().toLocaleDateString('hi-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  initInstallUI('adminInstallBtn');
  await loadDays();
  await Promise.all([loadDashboard(),loadClasses(),loadMaterials(),loadBroadcasts(),loadStudents()]);
  startAdminTargetDateSync();
}

async function loadDays(){
  const r=await sb.from('schedule_days').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).order('day_date').order('day_number');
  if(r.error){toast(r.error.message,'error');return}
  days=(r.data||[]).sort((a,b)=>String(a.day_date||'').localeCompare(String(b.day_date||''))||Number(a.day_number||0)-Number(b.day_number||0));
  const opts=days.map(d=>`<option value="${d.id}">Day ${d.day_number} — ${fmtDate(d.day_date)}</option>`).join('');
  byId('classDay').innerHTML=opts||'<option value="">कोई Day नहीं मिला</option>';
  selectSuggestedDay('today',false);
}
function selectedScheduleDay(){return days.find(d=>String(d.id)===String(byId('classDay')?.value||''))||null}
function selectSuggestedDay(mode,notify=true){
  const select=byId('classDay');if(!select||!days.length)return;
  const today=localDateKey();
  let selected;
  if(mode==='next')selected=days.find(d=>String(d.day_date)>today)||days[days.length-1];
  else selected=days.find(d=>String(d.day_date)===today)||days.find(d=>String(d.day_date)>today)||days[days.length-1];
  if(selected)select.value=selected.id;
  onClassDayChange(false,true);
  if(notify)toast(mode==='next'?'अगला उपलब्ध Day चुन लिया गया।':'आज का Day चुन लिया गया।','success');
}
function changeClassDay(delta){
  const select=byId('classDay');if(!select||!days.length)return;
  const index=Math.max(0,days.findIndex(d=>String(d.id)===String(select.value)));
  const next=Math.min(days.length-1,Math.max(0,index+Number(delta||0)));
  select.value=days[next].id;onClassDayChange(true,true);
}
function onClassDayChange(scroll=true,autoLoadForm=true){
  const day=selectedScheduleDay();
  renderClasses();
  renderTargetClassQuickPick();
  if(byId('classesListHeading'))byId('classesListHeading').textContent=day?`Day ${day.day_number} — ${fmtDate(day.day_date)}`:'Selected Day Targets';
  renderClassPlanSummary();
  if(autoLoadForm)loadSelectedDayTarget(1,true,false);
  if(scroll&&window.innerWidth<780)byId('classesList')?.scrollIntoView({behavior:'smooth',block:'start'});
}

async function loadDashboard(){
  const [studentR,classR,pdfR]=await Promise.all([
    sb.from('profiles').select('id',{count:'exact',head:true}).eq('role','student'),
    sb.from('daily_targets').select('id',{count:'exact',head:true}).eq('status','published').eq('simple_class_enabled',true),
    sb.from('study_materials').select('id,pdf_type,student_visible').eq('status','published')
  ]);
  const pdfRows=pdfR.data||[];
  byId('kpis').innerHTML=`
    <div class="kpi-card kpi-blue span-3"><div class="muted">Students</div><div class="kpi">${Number(studentR.count||0)}</div></div>
    <div class="kpi-card kpi-red span-3"><div class="muted">Target Classes</div><div class="kpi">${Number(classR.count||0)}</div></div>
    <div class="kpi-card kpi-green span-3"><div class="muted">Class PDFs</div><div class="kpi">${pdfRows.filter(x=>(x.pdf_type||'class')==='class'&&x.student_visible).length}</div></div>
    <div class="kpi-card kpi-purple span-3"><div class="muted">Other PDFs</div><div class="kpi">${pdfRows.filter(x=>x.pdf_type==='direct'&&x.student_visible).length}</div></div>`;
}

function visibilityModeLabel(mode){
  return mode==='show'?'Show Now':mode==='hide'?'Hidden':'Auto by Date';
}
function visibilityModeClass(mode){
  return mode==='show'?'badge-green':mode==='hide'?'badge-gray':'badge-blue';
}
function isClassCurrentlyVisible(row){
  const mode=row.visibility_mode||'auto';
  if(mode==='show')return true;
  if(mode==='hide')return false;
  const day=row.schedule_days||selectedScheduleDay()||{};
  return Number(day.day_number||0)<=5||String(day.day_date||'')<=localDateKey();
}
function resetClassForm(){
  byId('classId').value='';byId('classTitle').value='';byId('classSubject').value='';byId('classTopic').value='';byId('classYoutube').value='';byId('classStartTime').value='';byId('classDuration').value='60';byId('classType').value='live';byId('classStatus').value='scheduled';byId('classNote').value='';byId('classVisibilityMode').value='auto';byId('classNotify').checked=true;byId('saveClassBtn').textContent='Save Target / Class';if(byId('classFormHeading'))byId('classFormHeading').textContent='Extra Class जोड़ें';renderTargetClassQuickPick();
}
function fillClassForm(x,scroll=false){
  if(!x)return;
  byId('classId').value=x.id||'';
  if(x.schedule_day_id)byId('classDay').value=x.schedule_day_id;
  byId('classTitle').value=x.class_title||x.topic||'';
  byId('classSubject').value=x.subject||'';
  byId('classTopic').value=x.topic||'';
  byId('classYoutube').value=x.youtube_url||'';
  byId('classStartTime').value=String(x.start_time||'').slice(0,5);
  byId('classDuration').value=Number(x.duration_minutes||60);
  byId('classType').value=x.class_type||'live';
  byId('classStatus').value=x.class_status==='partial'?'time_changed':(x.class_status||'scheduled');
  byId('classNote').value=x.class_note||'';
  byId('classVisibilityMode').value=x.visibility_mode||'auto';
  byId('classNotify').checked=false;
  byId('saveClassBtn').textContent='Update Target / Class';
  if(byId('classFormHeading'))byId('classFormHeading').textContent=`Day ${x.schedule_days?.day_number||'-'} • Class ${x.target_order||'-'} Edit`;
  renderTargetClassQuickPick();
  if(scroll)window.scrollTo({top:0,behavior:'smooth'});
}
function loadTargetIntoForm(id,scroll=true){
  const row=classes.find(item=>String(item.id)===String(id));
  if(row)fillClassForm(row,scroll);
}
function loadSelectedDayTarget(order=1,force=false,scroll=false){
  if(!force&&byId('classId')?.value)return;
  const rows=rowsForScheduleDay();
  const row=rows.find(item=>Number(item.target_order||0)===Number(order))||rows[0];
  if(row)fillClassForm(row,scroll);
}
function renderTargetClassQuickPick(){
  const host=byId('targetClassQuickPick');if(!host)return;
  const rows=rowsForScheduleDay();
  const activeId=String(byId('classId')?.value||'');
  host.innerHTML=rows.map(row=>`<button type="button" class="target-quick-btn ${String(row.id)===activeId?'active':''}" onclick="loadTargetIntoForm('${row.id}',false)">Class ${Number(row.target_order||1)}<small>${esc(row.topic||row.class_title||'Target')}</small></button>`).join('')||'<span class="muted">इस Day का Target उपलब्ध नहीं है।</span>';
}
async function saveClass(){
  const visibilityMode=byId('classVisibilityMode').value;
  const payload={
    p_class_id:byId('classId').value||null,
    p_schedule_day_id:byId('classDay').value||null,
    p_class_title:byId('classTitle').value.trim(),
    p_subject:byId('classSubject').value.trim(),
    p_topic:byId('classTopic').value.trim(),
    p_youtube_url:byId('classYoutube').value.trim()||null,
    p_start_time:byId('classStartTime').value||null,
    p_duration_minutes:Math.max(1,Number(byId('classDuration').value||60)),
    p_class_type:byId('classType').value,
    p_class_status:byId('classStatus').value,
    p_class_note:byId('classNote').value.trim()||null,
    p_visibility_mode:visibilityMode
  };
  if(!payload.p_schedule_day_id||!payload.p_class_title||!payload.p_subject||!payload.p_topic){toast('Day, Class Title, Subject और Topic जरूरी हैं।','error');return}
  const btn=byId('saveClassBtn'),old=btn.textContent;btn.disabled=true;btn.textContent='Saving...';
  try{
    const r=await sb.rpc('admin_save_target_class_v1226',payload);
    if(r.error)throw r.error;
    const saved=r.data;
    if(visibilityMode!=='hide'&&byId('classNotify').checked){
      const day=days.find(d=>String(d.id)===String(payload.p_schedule_day_id));
      const status=payload.p_class_status==='cancelled'?'Class Cancelled':payload.p_class_status==='time_changed'?'Class Time Changed':'▶ Class Update';
      const msg=`${payload.p_class_title} • ${fmtDate(day?.day_date||'')} • ${classTimeLabel({start_time:payload.p_start_time,class_type:payload.p_class_type})}`;
      await createGlobalNotification(status,msg,'class',saved?.id||payload.p_class_id);
    }
    toast('Target / Class save हो गई।','success');resetClassForm();await Promise.all([loadClasses(),loadDashboard()]);
  }catch(e){toast(e.message||'Target / Class save नहीं हुई।','error')}
  finally{btn.disabled=false;btn.textContent=old}
}
function editClass(id){
  const x=classes.find(c=>String(c.id)===String(id));if(!x)return;
  fillClassForm(x,true);
  renderClasses();
  renderClassPlanSummary();
}
async function saveClassVisibility(id){
  const mode=byId('classMode_'+id)?.value||'auto';
  const r=await sb.rpc('admin_set_target_visibility_mode_v1226',{p_class_id:id,p_mode:mode});
  if(r.error){toast(r.error.message,'error');return}
  toast(mode==='show'?'Target अभी Students को दिखेगा।':mode==='hide'?'Target Students से hide कर दिया गया।':'Target अपनी तारीख पर अपने-आप दिखेगा।','success');
  await Promise.all([loadClasses(),loadDashboard()]);
}
async function deleteClass(id){
  const row=classes.find(x=>String(x.id)===String(id));
  if(row&&row.is_extra_class===false){toast('Planned Target delete नहीं होगा। जरूरत हो तो Hide करें या Edit करें।','error');return}
  if(!(await adminConfirmDelete('यह Extra Class delete करनी है?')))return;
  const r=await sb.rpc('admin_delete_simple_class',{p_class_id:id});
  if(r.error){toast(r.error.message,'error');return}
  toast('Extra Class delete हो गई।','success');await Promise.all([loadClasses(),loadMaterials(),loadDashboard()]);
}
function renderClassPlanSummary(){
  const host=byId('classPlanSummary');if(!host)return;
  const day=selectedScheduleDay();
  if(!day){host.innerHTML='';return}
  const rows=rowsForScheduleDay(day);
  const visible=rows.filter(isClassCurrentlyVisible).length;
  const planType=rows.length===1&&String(rows[0]?.subject||'').includes('करंट')?'Current Affairs':`${rows.filter(x=>x.is_extra_class===false).length} Planned Class`;
  host.innerHTML=`<article><span>Selected Day</span><b>Day ${day.day_number}</b><small>${fmtDate(day.day_date)}</small></article><article><span>Plan</span><b>${planType}</b><small>${rows.length} total item</small></article><article><span>Student Status</span><b>${visible} Visible</b><small>${rows.length-visible} hidden / future</small></article><article><span>Auto Release</span><b>${String(day.day_date)<=localDateKey()||Number(day.day_number)<=5?'Released':'Scheduled'}</b><small>${Number(day.day_number)<=5?'First 5 immediate':'Date: '+fmtDate(day.day_date)}</small></article>`;
}
function compactTargetCard(x){
  const mainTopic=x.topic||x.class_title||'Class';
  const secondary=x.class_title&&String(x.class_title).trim()!==String(mainTopic).trim()?x.class_title:'';
  const classLabel=x.is_extra_class===false?`CLASS ${Number(x.target_order||1)}`:'EXTRA';
  return `<article class="target-compact-card">
    <div class="target-compact-head"><span class="target-order-chip">${classLabel}</span><span class="target-day-chip">Day ${Number(x.schedule_days?.day_number||0)} • ${esc(fmtDate(x.schedule_days?.day_date||''))}</span><span class="badge ${statusClass(x.class_status)}">${esc(statusLabel(x.class_status))}</span></div>
    <h3>${esc(mainTopic)}</h3>${secondary?`<p class="target-secondary-title">${esc(secondary)}</p>`:''}
    <p class="target-subject-line">${esc(x.subject||'')}</p>
    <div class="target-compact-meta"><span>⏰ ${esc(classTimeLabel(x))}</span><span>• ${Number(x.duration_minutes||60)} मिनट</span></div>
    <div class="target-youtube-status ${x.youtube_url?'ready':'missing'}">${x.youtube_url?'✓ YouTube Link जोड़ा गया':'YouTube Link अभी नहीं जोड़ा गया'}</div>
    ${x.class_note?`<p class="student-note">${esc(x.class_note)}</p>`:''}
    <div class="target-compact-actions">
      <select id="classMode_${x.id}" class="mini-select"><option value="auto" ${(x.visibility_mode||'auto')==='auto'?'selected':''}>Auto by Date</option><option value="show" ${x.visibility_mode==='show'?'selected':''}>Show Now</option><option value="hide" ${x.visibility_mode==='hide'?'selected':''}>Hide</option></select>
      <button class="btn btn-blue btn-mini" onclick="saveClassVisibility('${x.id}')">Save</button>
      <button class="btn btn-light btn-mini" onclick="editClass('${x.id}')">Edit</button>
      ${x.is_extra_class!==false?`<button class="btn btn-red btn-mini" onclick="deleteClass('${x.id}')">Delete</button>`:''}
    </div>
    <div class="target-visible-line ${isClassCurrentlyVisible(x)?'visible':'waiting'}">${isClassCurrentlyVisible(x)?'Student को दिखाई दे रहा है':'अभी Student को दिखाई नहीं देगा'}</div>
  </article>`;
}
function renderClasses(){
  const host=byId('classesList');if(!host)return;
  const rows=rowsForScheduleDay();
  host.innerHTML=rows.map(compactTargetCard).join('')||'<div class="item">इस Day का Target अभी नहीं मिला।</div>';
  renderClassPlanSummary();
  renderTargetClassQuickPick();
}
async function loadClasses(){
  const r=await sb.from('daily_targets').select('*,schedule_days(day_number,day_date)').eq('status','published').eq('simple_class_enabled',true);
  const host=byId('classesList');if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}</div>`;return}
  classes=(r.data||[]).sort(compareTargetRows);
  byId('classPdfTarget').innerHTML='<option value="">Class चुनें</option>'+classes.map(x=>`<option value="${x.id}">${esc(classDayLabel(x))} — ${esc(x.topic||x.class_title||'Class')}</option>`).join('');
  renderClasses();
  if(!byId('classId')?.value)loadSelectedDayTarget(1,true,false);
}

const pdfUploadBusy={class:false,direct:false};
function pdfUploadControlIds(type){
  const isClass=type==='class';
  return {
    button:isClass?'classPdfSaveBtn':'otherPdfSaveBtn',
    status:isClass?'classPdfUploadStatus':'otherPdfUploadStatus'
  };
}
function setPdfUploadStatus(type,message,state='info'){
  const host=byId(pdfUploadControlIds(type).status);
  if(!host)return;
  host.className=`pdf-upload-status ${state}`;
  host.textContent=message||'';
  host.classList.toggle('hidden',!message);
}
function bindPdfUploadControls(){
  [['class','classPdfSaveBtn'],['direct','otherPdfSaveBtn']].forEach(([type,id])=>{
    const button=byId(id);
    if(!button||button.dataset.pdfUploadBound==='1')return;
    button.dataset.pdfUploadBound='1';
    button.type='button';
    button.removeAttribute('onclick');
    button.addEventListener('click',event=>{
      event.preventDefault();
      event.stopPropagation();
      uploadSimplePdf(type);
    });
  });
}

function resetPdfForm(type){
  const isClass=type==='class';
  byId(isClass?'classPdfId':'otherPdfId').value='';
  byId(isClass?'classPdfTitle':'otherPdfTitle').value='';
  byId(isClass?'classPdfFile':'otherPdfFile').value='';
  byId(isClass?'classPdfDownload':'otherPdfDownload').value='direct_download';
  byId(isClass?'classPdfVisible':'otherPdfVisible').checked=true;
  byId(isClass?'classPdfNotify':'otherPdfNotify').checked=true;
  if(isClass)byId('classPdfTarget').value='';else byId('otherPdfCategory').value='';
  byId(isClass?'classPdfSaveBtn':'otherPdfSaveBtn').textContent=isClass?'Upload Class PDF':'Upload Other PDF';
  byId(isClass?'classPdfCancelBtn':'otherPdfCancelBtn').classList.add('hidden');
  setPdfUploadStatus(type,'');
}
function editPdf(id){
  const m=materials.find(x=>String(x.id)===String(id));if(!m)return;
  const isClass=(m.pdf_type||'class')==='class';
  byId(isClass?'classPdfId':'otherPdfId').value=m.id;
  byId(isClass?'classPdfTitle':'otherPdfTitle').value=m.title||'';
  byId(isClass?'classPdfDownload':'otherPdfDownload').value=m.access_mode==='direct_download'?'direct_download':'read_only';
  byId(isClass?'classPdfVisible':'otherPdfVisible').checked=m.student_visible===true;
  byId(isClass?'classPdfNotify':'otherPdfNotify').checked=false;
  if(isClass)byId('classPdfTarget').value=m.target_id||'';else byId('otherPdfCategory').value=m.category||'';
  byId(isClass?'classPdfSaveBtn':'otherPdfSaveBtn').textContent=isClass?'Update Class PDF':'Update Other PDF';
  byId(isClass?'classPdfCancelBtn':'otherPdfCancelBtn').classList.remove('hidden');
  tab(isClass?'classpdfs':'otherpdfs',document.querySelector(`.simple-sidebar a[onclick*="${isClass?'classpdfs':'otherpdfs'}"]`));
  window.scrollTo({top:0,behavior:'smooth'});
}
async function uploadSimplePdf(type){
  const isClass=type==='class';
  const normalizedType=isClass?'class':'direct';
  if(pdfUploadBusy[normalizedType]){
    setPdfUploadStatus(normalizedType,'PDF upload पहले से चल रही है। कृपया पूरा होने दें।','loading');
    return;
  }
  const id=byId(isClass?'classPdfId':'otherPdfId')?.value||null;
  const existing=id?materials.find(x=>String(x.id)===String(id)):null;
  const file=byId(isClass?'classPdfFile':'otherPdfFile')?.files?.[0]||null;
  const title=String(byId(isClass?'classPdfTitle':'otherPdfTitle')?.value||'').trim()||file?.name||existing?.title||'';
  const targetId=isClass?(byId('classPdfTarget')?.value||''):null;
  const category=isClass?'Class PDF':(String(byId('otherPdfCategory')?.value||'').trim()||'Other PDF');
  const access=byId(isClass?'classPdfDownload':'otherPdfDownload')?.value||'direct_download';
  const visible=byId(isClass?'classPdfVisible':'otherPdfVisible')?.checked===true;
  const notify=byId(isClass?'classPdfNotify':'otherPdfNotify')?.checked===true;
  if(!id&&!file){setPdfUploadStatus(normalizedType,'PDF file चुनें।','error');toast('PDF file चुनें।','error');return}
  if(!title){setPdfUploadStatus(normalizedType,'PDF Title लिखें।','error');toast('PDF Title लिखें।','error');return}
  if(file&&file.type&&file.type!=='application/pdf'){setPdfUploadStatus(normalizedType,'केवल PDF file upload करें।','error');toast('केवल PDF upload करें।','error');return}
  if(file&&file.size>95*1024*1024){setPdfUploadStatus(normalizedType,'PDF 95 MB से बड़ी है।','error');toast('एक PDF अधिकतम 95 MB रखें।','error');return}
  if(isClass&&!targetId){setPdfUploadStatus(normalizedType,'Related Class चुनें।','error');toast('Related Class चुनें।','error');return}
  const target=classes.find(x=>String(x.id)===String(targetId));
  const ids=pdfUploadControlIds(normalizedType);
  const button=byId(ids.button);
  if(!button){toast('PDF Upload button उपलब्ध नहीं है। Page reload करें।','error');return}
  const oldText=button.textContent;
  let newKey='';
  pdfUploadBusy[normalizedType]=true;
  button.disabled=true;
  button.textContent=id?'Updating PDF...':'Uploading PDF...';
  setPdfUploadStatus(normalizedType,'1/4 Admin session जाँच रही है…','loading');
  try{
    const sessionResult=await sb.auth.getSession();
    if(sessionResult.error)throw sessionResult.error;
    const session=sessionResult.data?.session;
    if(!session?.access_token)throw new Error('Admin login session समाप्त हो गया है। दोबारा Login करें।');
    adminUser=adminUser||session.user;
    if(file){
      setPdfUploadStatus(normalizedType,`2/4 ${file.name} R2 में upload हो रही है…`,'loading');
      const up=await r2ApiFetch(`/admin/upload?filename=${encodeURIComponent(file.name)}`,{method:'PUT',headers:{'Content-Type':'application/pdf','X-File-Name':file.name},body:file});
      if(!up.ok)throw new Error(await r2ErrorMessage(up,`R2 upload failed (${up.status})`));
      const uploadData=await up.json().catch(()=>({}));
      newKey=uploadData.key||'';
      if(!newKey)throw new Error('R2 file key नहीं मिला।');
    }
    setPdfUploadStatus(normalizedType,'3/4 PDF की जानकारी database में save हो रही है…','loading');
    const row={
      schedule_day_id:isClass?(target?.schedule_day_id||null):null,target_id:isClass?targetId:null,title,category,
      material_type:'pdf',pdf_type:isClass?'class':'direct',storage_path:newKey||existing?.storage_path,
      file_size_bytes:file?file.size:(existing?.file_size_bytes||null),mime_type:'application/pdf',status:'published',access_mode:access,
      download_test_id:null,download_pass_percent:0,requires_class_verification:false,requires_pdf_verification:false,
      verification_question_count:0,pdf_verification_pass_percent:0,student_visible:visible,
      published_at:visible?(existing?.published_at||new Date().toISOString()):existing?.published_at||null
    };
    let db;
    if(id)db=await sb.from('study_materials').update(row).eq('id',id).select().single();
    else db=await sb.from('study_materials').insert({...row,uploaded_by:adminUser.id}).select().single();
    if(db.error)throw db.error;
    if(id&&newKey&&existing?.storage_path&&existing.storage_path!==newKey&&isR2PdfPath(existing.storage_path)){
      try{await r2ApiFetch(`/admin/file?key=${encodeURIComponent(existing.storage_path)}`,{method:'DELETE'})}catch(e){console.warn('Old PDF cleanup:',e)}
    }
    setPdfUploadStatus(normalizedType,'4/4 PDF Students के लिए publish की जा रही है…','loading');
    if(visible&&notify)await createGlobalNotification(id?'📄 PDF Updated':'📄 नई PDF उपलब्ध',title,'pdf',db.data.id);
    setPdfUploadStatus(normalizedType,id?'PDF सफलतापूर्वक update हो गई।':'PDF सफलतापूर्वक upload होकर Students के लिए save हो गई।','success');
    toast(id?'PDF update हो गई।':'PDF upload हो गई और setting save हो गई।','success');
    await Promise.all([loadMaterials(),loadDashboard()]);
    setTimeout(()=>resetPdfForm(normalizedType),1200);
  }catch(e){
    if(newKey){try{await r2ApiFetch(`/admin/file?key=${encodeURIComponent(newKey)}`,{method:'DELETE'})}catch(_) {}}
    const message=e?.message||'PDF save नहीं हुई।';
    setPdfUploadStatus(normalizedType,`PDF upload नहीं हुई: ${message}`,'error');
    toast(message,'error');
    console.error('PDF upload error:',e);
  }finally{
    pdfUploadBusy[normalizedType]=false;
    button.disabled=false;
    if(button.textContent==='Updating PDF...'||button.textContent==='Uploading PDF...')button.textContent=oldText;
  }
}
window.uploadSimplePdf=uploadSimplePdf;

async function saveMaterialSettings(id){
  const visible=byId('materialVisible_'+id)?.checked===true;
  const access=byId('materialAccess_'+id)?.value||'read_only';
  const r=await sb.rpc('admin_set_simple_material_settings',{p_material_id:id,p_visible:visible,p_access_mode:access});
  if(r.error){toast(r.error.message,'error');return}
  toast('PDF setting save हो गई।','success');await Promise.all([loadMaterials(),loadDashboard()]);
}
async function deletePdf(id,key){
  if(!(await adminConfirmDelete('यह PDF database और R2 दोनों से delete करनी है?')))return;
  let db=await sb.rpc('admin_delete_material',{p_material_id:id});
  if(db.error){db=await sb.from('study_materials').delete().eq('id',id);if(db.error){toast(db.error.message,'error');return}}
  try{if(key&&isR2PdfPath(key))await r2ApiFetch(`/admin/file?key=${encodeURIComponent(key)}`,{method:'DELETE'});else if(key)await sb.storage.from('study-pdfs').remove([key])}catch(e){console.warn(e)}
  toast('PDF delete हो गई।','success');await Promise.all([loadMaterials(),loadDashboard()]);
}
async function loadMaterials(){
  const r=await sb.from('study_materials').select('*').eq('status','published').order('created_at',{ascending:false});
  if(r.error){byId('classPdfList').innerHTML=byId('otherPdfList').innerHTML=`<div class="item text-error">${esc(r.error.message)}</div>`;return}
  materials=r.data||[];
  const render=(rows,label)=>rows.map(m=>`<article class="simple-content-card"><div class="simple-card-main"><div class="simple-card-top"><span class="badge ${m.student_visible?'badge-green':'badge-gray'}">${m.student_visible?'Student Visible':'Hidden'}</span><span class="badge badge-blue">${esc(m.access_mode==='direct_download'?'Download Allowed':'Read Only')}</span></div><h3>📄 ${esc(m.title||'PDF')}</h3><p>${label==='Class PDF'?esc((classes.find(c=>String(c.id)===String(m.target_id))||{}).class_title||(classes.find(c=>String(c.id)===String(m.target_id))||{}).topic||'Unlinked Class'):esc(m.category||'Other PDF')}</p><p class="small">${isR2PdfPath(m.storage_path)?'Cloudflare R2':'Legacy Storage'}</p></div><div class="simple-card-actions stacked"><label class="simple-toggle compact"><input id="materialVisible_${m.id}" type="checkbox" ${m.student_visible?'checked':''}><span>Show</span></label><select id="materialAccess_${m.id}" class="mini-select"><option value="direct_download" ${m.access_mode==='direct_download'?'selected':''}>Download Allow</option><option value="read_only" ${m.access_mode!=='direct_download'?'selected':''}>Read Only</option></select><button class="btn btn-light btn-mini" onclick="editPdf('${m.id}')">Edit</button><button class="btn btn-blue btn-mini" onclick="saveMaterialSettings('${m.id}')">Save</button><button class="btn btn-red btn-mini" onclick='deletePdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")})'>Delete</button></div></article>`).join('')||`<div class="item">अभी कोई ${label} नहीं है।</div>`;
  byId('classPdfList').innerHTML=render(materials.filter(x=>(x.pdf_type||'class')==='class'),'Class PDF');
  byId('otherPdfList').innerHTML=render(materials.filter(x=>x.pdf_type==='direct'),'Other PDF');
}

async function createGlobalNotification(title,message,relatedType,relatedId){
  const row={title,message,notification_type:'info',related_type:relatedType||null,related_id:String(relatedId||'')||null,is_active:true};
  const rr=await sb.from('app_notifications').insert(row).select().single();
  if(rr.error){console.warn('Notification save:',rr.error);return {ok:false,error:rr.error}}
  try{await sendPushNotification(title,message,relatedType,rr.data?.id,relatedId)}catch(e){console.warn(e)}
  return {ok:true,data:rr.data};
}
function resetBroadcastForm(){
  byId('broadcastId').value='';byId('broadcastTitle').value='';byId('broadcastMessage').value='';byId('broadcastType').value='info';
  byId('broadcastSaveBtn').textContent='Send to All Students';byId('broadcastCancelBtn').classList.add('hidden');
}
function editBroadcast(id){
  const x=(window.__broadcastRows||[]).find(row=>String(row.id)===String(id));if(!x)return;
  byId('broadcastId').value=x.id;byId('broadcastTitle').value=x.title||'';byId('broadcastMessage').value=x.message||'';byId('broadcastType').value=x.message_type||'info';
  byId('broadcastSaveBtn').textContent='Update Message';byId('broadcastCancelBtn').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
}
async function sendBroadcast(){
  const id=byId('broadcastId').value||null,title=byId('broadcastTitle').value.trim(),message=byId('broadcastMessage').value.trim();
  if(!title||!message){toast('Title और Message लिखें।','error');return}
  const payload={title,message,message_type:byId('broadcastType').value,is_active:true};
  const rr=id?await sb.from('broadcast_messages').update(payload).eq('id',id).select().single():await sb.from('broadcast_messages').insert(payload).select().single();
  if(rr.error){toast(rr.error.message,'error');return}
  await createGlobalNotification(id?'📣 Message Updated':title,id?`${title}: ${message}`:message,'broadcast',rr.data.id);
  resetBroadcastForm();toast(id?'Message update हो गया।':'संदेश सभी विद्यार्थियों को भेज दिया गया।','success');loadBroadcasts();
}
async function toggleBroadcast(id,current){
  const r=await sb.from('broadcast_messages').update({is_active:!current}).eq('id',id);if(r.error){toast(r.error.message,'error');return}
  toast(!current?'Message Students को दिखाई देगा।':'Message hide हो गया।','success');loadBroadcasts();
}
async function deleteBroadcast(id){
  if(!(await adminConfirmDelete('यह Message delete करना है?')))return;
  let r=await sb.rpc('admin_delete_broadcast',{p_broadcast_id:id});
  if(r.error){r=await sb.from('broadcast_messages').delete().eq('id',id);if(r.error){toast(r.error.message,'error');return}}
  if(String(byId('broadcastId').value)===String(id))resetBroadcastForm();
  toast('Message delete हो गया।','success');loadBroadcasts();
}
async function loadBroadcasts(){
  const r=await sb.from('broadcast_messages').select('*').order('created_at',{ascending:false}).limit(100);
  window.__broadcastRows=r.data||[];
  byId('broadcastList').innerHTML=(r.data||[]).map(x=>`<article class="simple-content-card"><div class="simple-card-main"><div class="simple-card-top"><span class="badge badge-blue">${esc(x.message_type||'info')}</span><span class="badge ${x.is_active?'badge-green':'badge-gray'}">${x.is_active?'Student Visible':'Hidden'}</span></div><h3>${esc(x.title)}</h3><p>${esc(x.message)}</p><p class="small muted">${x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):''}</p></div><div class="simple-card-actions stacked"><button class="btn btn-light btn-mini" onclick="editBroadcast(${x.id})">Edit</button><button class="btn btn-blue btn-mini" onclick="toggleBroadcast(${x.id},${x.is_active})">${x.is_active?'Hide':'Show'}</button><button class="btn btn-red btn-mini" onclick="deleteBroadcast(${x.id})">Delete</button></div></article>`).join('')||'<div class="item">अभी कोई Message नहीं है।</div>';
}

let posterObjectUrls=[],posterUploadPreviewUrl='';
function clearPosterObjectUrls(){posterObjectUrls.forEach(URL.revokeObjectURL);posterObjectUrls=[]}
function toDateTimeLocal(value){if(!value)return '';const d=new Date(value);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}
function resetPosterForm(){
  byId('posterId').value='';byId('posterExistingKey').value='';byId('posterTitle').value='';byId('posterFile').value='';byId('posterLink').value='';byId('posterStart').value='';byId('posterEnd').value='';byId('posterActive').value='true';byId('posterOrder').value='0';
  if(posterUploadPreviewUrl){URL.revokeObjectURL(posterUploadPreviewUrl);posterUploadPreviewUrl=''}
  byId('posterUploadPreviewImage').src='';byId('posterUploadPreviewImage').classList.add('hidden');byId('posterUploadPreviewEmpty').classList.remove('hidden');
  byId('posterSaveBtn').textContent='Publish Poster';byId('posterCancelBtn').classList.add('hidden');
}
function previewPosterFile(){
  const f=byId('posterFile')?.files?.[0],img=byId('posterUploadPreviewImage'),empty=byId('posterUploadPreviewEmpty');
  if(posterUploadPreviewUrl){URL.revokeObjectURL(posterUploadPreviewUrl);posterUploadPreviewUrl=''}
  if(!f){if(!byId('posterId').value){img.classList.add('hidden');empty.classList.remove('hidden')}return}
  if(!f.type.startsWith('image/')){toast('Image file चुनें।','error');return}
  posterUploadPreviewUrl=URL.createObjectURL(f);img.src=posterUploadPreviewUrl;img.classList.remove('hidden');empty.classList.add('hidden');
}
async function posterPreviewUrl(key){const res=await r2ApiFetch(`/poster?key=${encodeURIComponent(key)}`);if(!res.ok)throw new Error(await r2ErrorMessage(res,'Poster load failed'));const url=URL.createObjectURL(await res.blob());posterObjectUrls.push(url);return url}
function editPoster(id){
  const p=posters.find(x=>String(x.id)===String(id));if(!p)return;
  byId('posterId').value=p.id;byId('posterExistingKey').value=p.image_key||'';byId('posterTitle').value=p.title||'';byId('posterLink').value=p.click_url||'';byId('posterStart').value=toDateTimeLocal(p.start_at);byId('posterEnd').value=toDateTimeLocal(p.end_at);byId('posterActive').value=String(p.is_active!==false);byId('posterOrder').value=Number(p.sort_order||0);
  const img=byId('posterUploadPreviewImage'),empty=byId('posterUploadPreviewEmpty');if(p.preview_url){img.src=p.preview_url;img.classList.remove('hidden');empty.classList.add('hidden')}
  byId('posterSaveBtn').textContent='Update Poster';byId('posterCancelBtn').classList.remove('hidden');window.scrollTo({top:0,behavior:'smooth'});
}
async function publishPoster(){
  const id=byId('posterId').value||null,oldKey=byId('posterExistingKey').value||'',f=byId('posterFile')?.files?.[0]||null;
  if(!id&&!f){toast('Poster image चुनें।','error');return}if(f&&f.size>5*1024*1024){toast('Poster 5 MB से कम रखें।','error');return}
  const btn=byId('posterSaveBtn'),oldText=btn.textContent;let newKey='';btn.disabled=true;btn.textContent=id?'Updating...':'Publishing...';
  try{
    if(f){const up=await r2ApiFetch(`/admin/poster-upload?filename=${encodeURIComponent(f.name)}`,{method:'POST',headers:{'Content-Type':f.type,'X-File-Name':f.name},body:f});if(!up.ok)throw new Error(await r2ErrorMessage(up,'Poster upload failed'));newKey=(await up.json()).key}
    const payload={title:byId('posterTitle').value.trim()||'Poster',image_key:newKey||oldKey,click_url:byId('posterLink').value.trim()||null,start_at:isoOrNull(byId('posterStart').value),end_at:isoOrNull(byId('posterEnd').value),is_active:byId('posterActive').value==='true',sort_order:Number(byId('posterOrder').value||0),poster_format:'ratio_16_9',fit_mode:'contain'};
    let db=id?await sb.from('app_posters').update(payload).eq('id',id).select().single():await sb.from('app_posters').insert({...payload,created_by:adminUser.id}).select().single();
    if(db.error)throw db.error;
    if(id&&newKey&&oldKey&&newKey!==oldKey)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(oldKey)}`,{method:'DELETE'})}catch(e){console.warn('Old poster cleanup:',e)}
    if(payload.is_active)await createGlobalNotification(id?'🖼 Poster Updated':'🖼 नया Poster',payload.title,'poster',db.data.id);
    resetPosterForm();toast(id?'Poster update हो गया।':'Poster publish हो गया।','success');loadPosters();
  }catch(e){if(newKey)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(newKey)}`,{method:'DELETE'})}catch(_){}toast(e.message||'Poster save नहीं हुआ।','error')}
  finally{btn.disabled=false;if(btn.textContent==='Updating...'||btn.textContent==='Publishing...')btn.textContent=oldText}
}
async function togglePoster(id,current){const r=await sb.from('app_posters').update({is_active:!current}).eq('id',id);if(r.error){toast(r.error.message,'error');return}toast(!current?'Poster show होगा।':'Poster hide हो गया।','success');loadPosters()}
async function deletePoster(id,key){if(!(await adminConfirmDelete('यह Poster delete करना है?')))return;const r=await sb.from('app_posters').delete().eq('id',id);if(r.error){toast(r.error.message,'error');return}try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(key)}`,{method:'DELETE'})}catch(e){console.warn(e)}if(String(byId('posterId').value)===String(id))resetPosterForm();toast('Poster delete हो गया।','success');loadPosters()}
async function loadPosters(){
  const host=byId('posterList');clearPosterObjectUrls();const r=await sb.from('app_posters').select('*').order('sort_order').order('created_at',{ascending:false});if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}</div>`;return}
  posters=r.data||[];const out=[];for(const p of posters){let img='';try{img=await posterPreviewUrl(p.image_key);p.preview_url=img}catch(_){}out.push(`<article class="simple-content-card poster-row">${img?`<img src="${img}" alt="">`:''}<div class="simple-card-main"><span class="badge ${p.is_active?'badge-green':'badge-gray'}">${p.is_active?'Active':'Hidden'}</span><h3>${esc(p.title||'Poster')}</h3><p class="small">Order ${Number(p.sort_order||0)}</p></div><div class="simple-card-actions stacked"><button class="btn btn-light btn-mini" onclick="editPoster('${p.id}')">Edit</button><button class="btn btn-blue btn-mini" onclick="togglePoster('${p.id}',${p.is_active})">${p.is_active?'Hide':'Show'}</button><button class="btn btn-red btn-mini" onclick='deletePoster(${JSON.stringify(p.id)},${JSON.stringify(p.image_key)})'>Delete</button></div></article>`)}
  host.innerHTML=out.join('')||'<div class="item">अभी कोई Poster नहीं है।</div>';
}

async function loadStudents(){
  const r=await sb.from('profiles').select('id,full_name,email,phone,is_active,created_at').eq('role','student').order('created_at',{ascending:false});
  if(r.error){toast(r.error.message,'error');return}students=r.data||[];renderStudents(students);
}
async function toggleStudentStatus(id,current){
  const r=await sb.from('profiles').update({is_active:!current}).eq('id',id).eq('role','student');
  if(r.error){toast(r.error.message,'error');return}toast(!current?'Student account Active हो गया।':'Student account Inactive हो गया।','success');loadStudents();
}
function renderStudents(rows){byId('studentsBody').innerHTML=rows.map(s=>`<tr><td><b>${esc(s.full_name||'Student')}</b></td><td>${esc(s.email||'')}</td><td>${esc(s.phone||'')}</td><td><span class="badge ${s.is_active===false?'badge-gray':'badge-green'}">${s.is_active===false?'Inactive':'Active'}</span></td><td><button class="btn ${s.is_active===false?'btn-green':'btn-red'} btn-mini" onclick="toggleStudentStatus('${s.id}',${s.is_active!==false})">${s.is_active===false?'Activate':'Deactivate'}</button></td></tr>`).join('')||'<tr><td colspan="5">कोई Student नहीं मिला।</td></tr>'}
function filterStudents(){const q=byId('studentSearch').value.trim().toLowerCase();renderStudents(students.filter(s=>[s.full_name,s.email,s.phone].some(v=>String(v||'').toLowerCase().includes(q))))}

bindPdfUploadControls();
init();
