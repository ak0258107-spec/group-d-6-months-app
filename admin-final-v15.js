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


/* ===== FINAL V15 PREMIUM ADMIN ===== */
let adminUser=null;
let ytClasses=[];
let posters=[];
let importantInformation=[];
let students=[];
let posterPreviewUrls=[];
const FINAL_ADMIN_TABS=['cbt','classes','poster','info','students'];
function byId(id){return document.getElementById(id)}
function tab(name,el){
  if(!FINAL_ADMIN_TABS.includes(name))name='cbt';
  FINAL_ADMIN_TABS.forEach(x=>byId(x+'Tab')?.classList.toggle('hidden',x!==name));
  document.querySelectorAll('.v15-admin-tab[data-tab]').forEach(a=>a.classList.toggle('active',a.dataset.tab===name));
  if(name==='classes')loadYoutubeClasses();
  if(name==='poster')loadPostersAdmin();
  if(name==='info')loadImportantInfoAdmin();
  if(name==='students')loadStudents();
  window.scrollTo({top:0,behavior:'smooth'});
}
function haryanaTopics(){
  const src=window.topicsData?.haryana_gk?.topics||[];
  return src.map((t,i)=>({key:t.key||('haryana_'+(i+1)),name:t.name||t.topic_name||t.key}));
}
function fillHaryanaTopics(){
  const sel=byId('ytTopic');if(!sel)return;
  sel.innerHTML='<option value="">-- Haryana GK Topic चुनें --</option>'+haryanaTopics().map(t=>`<option value="${esc(t.key)}">${esc(t.name)}</option>`).join('');
}
function selectedTopic(){const key=byId('ytTopic')?.value||'';return haryanaTopics().find(t=>t.key===key)||null}
function resetYoutubeForm(){
  if(byId('ytId'))byId('ytId').value='';if(byId('ytTopic'))byId('ytTopic').value='';if(byId('ytTitle'))byId('ytTitle').value='';if(byId('ytPart'))byId('ytPart').value='1';if(byId('ytTagline'))byId('ytTagline').value='';if(byId('ytYoutube'))byId('ytYoutube').value='';if(byId('ytVisible'))byId('ytVisible').checked=true;if(byId('ytOrder'))byId('ytOrder').value='0';if(byId('ytSaveBtn'))byId('ytSaveBtn').textContent='Save Haryana GK Class';byId('ytCancelBtn')?.classList.add('hidden');
}
async function saveYoutubeClass(){
  const topic=selectedTopic();if(!topic)return toast('Haryana GK Topic चुनें।','error');
  const title=String(byId('ytTitle')?.value||'').trim();if(!title)return toast('Class/Topic Title लिखें।','error');
  const tagline=String(byId('ytTagline')?.value||'').trim();if(!tagline)return toast('YouTube वाली पूरी Tagline लिखें।','error');
  const youtube=String(byId('ytYoutube')?.value||'').trim();if(!/^https?:\/\//i.test(youtube))return toast('सही YouTube Link दें।','error');
  const id=byId('ytId')?.value||null;const oldClass=id?ytClasses.find(x=>String(x.id)===String(id)):null;const oldImageKey=oldClass?.image_key||'';const btn=byId('ytSaveBtn');if(btn){btn.disabled=true;btn.textContent='Saving...'}
  try{
    const payload={topic_key:topic.key,topic_name:topic.name,class_title:title,part_no:Math.max(1,Number(byId('ytPart')?.value||1)),tagline,youtube_url:youtube,image_key:null,student_visible:!!byId('ytVisible')?.checked,sort_order:Number(byId('ytOrder')?.value||0),updated_at:new Date().toISOString()};
    const q=id?sb.from('haryana_youtube_classes').update(payload).eq('id',id).select().single():sb.from('haryana_youtube_classes').insert({...payload,created_by:adminUser.id}).select().single();
    const r=await q;if(r.error)throw r.error;
    if(id&&oldImageKey)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(oldImageKey)}`,{method:'DELETE'})}catch(_){ }
    toast(id?'Class update हो गई।':'Class add हो गई।','success');resetYoutubeForm();await Promise.all([loadYoutubeClasses(),loadDashboard()]);
  }catch(e){toast(e.message||'Class save नहीं हुई।','error')}
  finally{if(btn){btn.disabled=false;if(btn.textContent==='Saving...')btn.textContent=id?'Update Class':'Save Haryana GK Class'}}
}
function editYoutubeClass(id){
  const c=ytClasses.find(x=>String(x.id)===String(id));if(!c)return;
  byId('ytId').value=c.id;byId('ytTopic').value=c.topic_key||'';byId('ytTitle').value=c.class_title||'';byId('ytPart').value=Number(c.part_no||1);byId('ytTagline').value=c.tagline||'';byId('ytYoutube').value=c.youtube_url||'';byId('ytVisible').checked=c.student_visible!==false;byId('ytOrder').value=Number(c.sort_order||0);byId('ytSaveBtn').textContent='Update Class';byId('ytCancelBtn').classList.remove('hidden');
}
function basePartTitle(title=''){return String(title).replace(/\s*[-–—:]?\s*Part\s*[-:]?\s*\d+\s*$/i,'').replace(/\s*[-–—:]?\s*भाग\s*[-:]?\s*\d+\s*$/i,'').trim()}
function addYoutubePart(id){
  const c=ytClasses.find(x=>String(x.id)===String(id));if(!c)return;resetYoutubeForm();
  const maxPart=Math.max(1,...ytClasses.filter(x=>x.topic_key===c.topic_key).map(x=>Number(x.part_no||1)));const next=maxPart+1;
  byId('ytTopic').value=c.topic_key;byId('ytPart').value=next;byId('ytTitle').value=`${basePartTitle(c.class_title||c.topic_name)} - Part ${next}`;byId('ytOrder').value=Number(c.sort_order||0)+1;byId('ytTagline').focus();toast(`Part ${next} तैयार है—पूरी Tagline और YouTube Link डालें।`,'success');
}
async function toggleYoutubeClass(id,current){const r=await sb.from('haryana_youtube_classes').update({student_visible:!current,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return toast(r.error.message,'error');toast(!current?'Student को Class दिखेगी।':'Class Hide हो गई।','success');await Promise.all([loadYoutubeClasses(),loadDashboard()])}
async function deleteYoutubeClass(id){if(!confirm('यह Haryana GK Class delete करनी है?'))return;const old=ytClasses.find(x=>String(x.id)===String(id));const r=await sb.from('haryana_youtube_classes').delete().eq('id',id);if(r.error)return toast(r.error.message,'error');if(old?.image_key)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(old.image_key)}`,{method:'DELETE'})}catch(_){ }toast('Class delete हो गई।','success');await Promise.all([loadYoutubeClasses(),loadDashboard()])}
async function loadYoutubeClasses(){
  const host=byId('ytClassList');if(!host)return;host.innerHTML='<div class="item">Classes load हो रही हैं…</div>';
  const r=await sb.from('haryana_youtube_classes').select('*').order('sort_order').order('created_at',{ascending:false});if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V15 SQL पहले run करें।</small></div>`;return}
  ytClasses=r.data||[];host.innerHTML=ytClasses.map(c=>`<article class="yt-admin-row no-thumb"><div class="yt-admin-main"><div><span class="badge ${c.student_visible?'badge-green':'badge-gray'}">${c.student_visible?'Student Visible':'Hidden'}</span><span class="badge badge-blue">Part ${Number(c.part_no||1)}</span></div><h3>${esc(c.class_title)}</h3><p><b>${esc(c.topic_name)}</b></p><p class="yt-tagline">${esc(c.tagline)}</p><p><a href="${esc(c.youtube_url)}" target="_blank" rel="noopener">YouTube Link खोलें ↗</a></p></div><div class="yt-admin-actions"><button class="btn btn-orange btn-mini" onclick="addYoutubePart('${c.id}')">＋ Part</button><button class="btn btn-light btn-mini" onclick="editYoutubeClass('${c.id}')">Edit</button><button class="btn btn-blue btn-mini" onclick="toggleYoutubeClass('${c.id}',${c.student_visible!==false})">${c.student_visible?'Hide':'Show'}</button><button class="btn btn-red btn-mini" onclick="deleteYoutubeClass('${c.id}')">Delete</button></div></article>`).join('')||'<div class="item">अभी कोई Haryana GK YouTube Class नहीं है।</div>';
}
function resetPosterForm(){
  ['posterId','posterExistingKey','posterTitle','posterMessage','posterActionLabel','posterActionUrl'].forEach(id=>{if(byId(id))byId(id).value=''});if(byId('posterFile'))byId('posterFile').value='';if(byId('posterVisible'))byId('posterVisible').checked=true;if(byId('posterPinned'))byId('posterPinned').checked=false;if(byId('posterOrder'))byId('posterOrder').value='0';const img=byId('posterPreviewImage');if(img){img.removeAttribute('src');img.classList.add('hidden')}byId('posterPreviewEmpty')?.classList.remove('hidden');byId('posterCancelBtn')?.classList.add('hidden');if(byId('posterSaveBtn'))byId('posterSaveBtn').textContent='Publish Poster';
}
function previewPosterFile(){
  const f=byId('posterFile')?.files?.[0],img=byId('posterPreviewImage');if(!f||!img)return;const u=URL.createObjectURL(f);posterPreviewUrls.push(u);img.src=u;img.classList.remove('hidden');byId('posterPreviewEmpty')?.classList.add('hidden');
}
async function r2PosterUrl(key){if(!key)return'';const r=await r2ApiFetch(`/poster?key=${encodeURIComponent(key)}`);if(!r.ok)throw new Error(await r2ErrorMessage(r,'Poster load failed'));const u=URL.createObjectURL(await r.blob());posterPreviewUrls.push(u);return u}
async function savePoster(){
  const id=byId('posterId')?.value||null,oldKey=byId('posterExistingKey')?.value||'',file=byId('posterFile')?.files?.[0]||null;const title=String(byId('posterTitle')?.value||'').trim();const message=String(byId('posterMessage')?.value||'').trim();const actionLabel=String(byId('posterActionLabel')?.value||'').trim();const actionUrl=String(byId('posterActionUrl')?.value||'').trim();
  if(!id&&!file)return toast('Poster image चुनें।','error');if(actionUrl&&!/^https?:\/\//i.test(actionUrl))return toast('Action Link सही http/https URL होना चाहिए।','error');if(file&&file.size>12*1024*1024)return toast('Poster image 12 MB से कम रखें।','error');
  const btn=byId('posterSaveBtn');let newKey='';if(btn){btn.disabled=true;btn.textContent='Uploading...'}
  try{
    if(file){const up=await r2ApiFetch(`/admin/poster-upload?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});if(!up.ok)throw new Error(await r2ErrorMessage(up,'Poster upload failed'));newKey=(await up.json()).key}
    const payload={title,message,image_key:newKey||oldKey,action_label:actionLabel||null,action_url:actionUrl||null,student_visible:!!byId('posterVisible')?.checked,pinned:!!byId('posterPinned')?.checked,sort_order:Number(byId('posterOrder')?.value||0),updated_at:new Date().toISOString()};
    const q=id?sb.from('app_posters').update(payload).eq('id',id).select().single():sb.from('app_posters').insert({...payload,created_by:adminUser.id}).select().single();const r=await q;if(r.error)throw r.error;
    if(id&&newKey&&oldKey&&newKey!==oldKey)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(oldKey)}`,{method:'DELETE'})}catch(_){ }
    toast(id?'Poster update हो गया।':'Poster publish हो गया।','success');resetPosterForm();await Promise.all([loadPostersAdmin(),loadDashboard()]);
  }catch(e){if(newKey)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(newKey)}`,{method:'DELETE'})}catch(_){ }toast(e.message||'Poster save नहीं हुआ।','error')}
  finally{if(btn){btn.disabled=false;if(btn.textContent==='Uploading...')btn.textContent=id?'Update Poster':'Publish Poster'}}
}
function editPoster(id){
  const p=posters.find(x=>String(x.id)===String(id));if(!p)return;byId('posterId').value=p.id;byId('posterExistingKey').value=p.image_key||'';byId('posterTitle').value=p.title||'';byId('posterMessage').value=p.message||'';byId('posterActionLabel').value=p.action_label||'';byId('posterActionUrl').value=p.action_url||'';byId('posterVisible').checked=p.student_visible!==false;byId('posterPinned').checked=!!p.pinned;byId('posterOrder').value=Number(p.sort_order||0);if(p.preview_url){byId('posterPreviewImage').src=p.preview_url;byId('posterPreviewImage').classList.remove('hidden');byId('posterPreviewEmpty').classList.add('hidden')}byId('posterSaveBtn').textContent='Update Poster';byId('posterCancelBtn').classList.remove('hidden');
}
async function togglePoster(id,current){const r=await sb.from('app_posters').update({student_visible:!current,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return toast(r.error.message,'error');toast(!current?'Poster Student को दिखेगा।':'Poster Hide हो गया।','success');await Promise.all([loadPostersAdmin(),loadDashboard()])}
async function togglePosterPin(id,current){const r=await sb.from('app_posters').update({pinned:!current,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return toast(r.error.message,'error');toast(!current?'Poster Pin हो गया।':'Poster Unpin हो गया।','success');await loadPostersAdmin()}
async function deletePoster(id,key){if(!confirm('यह Poster permanently delete करना है?'))return;const r=await sb.from('app_posters').delete().eq('id',id);if(r.error)return toast(r.error.message,'error');if(key)try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(key)}`,{method:'DELETE'})}catch(_){ }toast('Poster delete हो गया।','success');await Promise.all([loadPostersAdmin(),loadDashboard()])}
async function loadPostersAdmin(){
  const host=byId('posterList');if(!host)return;host.innerHTML='<div class="item">Posters load हो रहे हैं…</div>';posterPreviewUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});posterPreviewUrls=[];
  const r=await sb.from('app_posters').select('*').order('pinned',{ascending:false}).order('sort_order').order('created_at',{ascending:false});if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V15 SQL पहले run करें।</small></div>`;return}
  posters=r.data||[];const rows=[];for(const p of posters){let src='';try{src=await r2PosterUrl(p.image_key);p.preview_url=src}catch(_){ }rows.push(`<article class="poster-admin-row">${src?`<img src="${src}" alt="Poster">`:'<div class="poster-admin-empty">Poster</div>'}<div class="poster-admin-main"><div><span class="badge ${p.student_visible?'badge-green':'badge-gray'}">${p.student_visible?'Student Visible':'Hidden'}</span>${p.pinned?'<span class="badge badge-blue">Pinned</span>':''}</div>${p.title?`<h3>${esc(p.title)}</h3>`:''}${p.message?`<p>${esc(p.message)}</p>`:''}<small>${new Date(p.created_at).toLocaleString('hi-IN')}</small></div><div class="poster-admin-actions"><button class="btn btn-light btn-mini" onclick="editPoster('${p.id}')">Edit</button><button class="btn btn-orange btn-mini" onclick="togglePosterPin('${p.id}',${!!p.pinned})">${p.pinned?'Unpin':'Pin'}</button><button class="btn btn-blue btn-mini" onclick="togglePoster('${p.id}',${p.student_visible!==false})">${p.student_visible?'Hide':'Show'}</button><button class="btn btn-red btn-mini" onclick='deletePoster(${JSON.stringify(p.id)},${JSON.stringify(p.image_key||'')})'>Delete</button></div></article>`)}host.innerHTML=rows.join('')||'<div class="item">अभी कोई Poster नहीं है।</div>';
}
function resetImportantInfoForm(){
  ['infoId','infoTitle','infoMessage','infoActionLabel','infoActionUrl'].forEach(id=>{if(byId(id))byId(id).value=''});if(byId('infoVisible'))byId('infoVisible').checked=true;if(byId('infoPinned'))byId('infoPinned').checked=false;if(byId('infoOrder'))byId('infoOrder').value='0';byId('infoCancelBtn')?.classList.add('hidden');if(byId('infoSaveBtn'))byId('infoSaveBtn').textContent='Save Important Information';
}
async function saveImportantInfo(){
  const id=byId('infoId')?.value||null,title=String(byId('infoTitle')?.value||'').trim(),message=String(byId('infoMessage')?.value||'').trim(),actionLabel=String(byId('infoActionLabel')?.value||'').trim(),actionUrl=String(byId('infoActionUrl')?.value||'').trim();
  if(!title&&!message)return toast('Title या Message लिखें।','error');if(actionUrl&&!/^https?:\/\//i.test(actionUrl))return toast('Button Link सही http/https URL होना चाहिए।','error');
  const payload={title,message,action_label:actionLabel||null,action_url:actionUrl||null,student_visible:!!byId('infoVisible')?.checked,pinned:!!byId('infoPinned')?.checked,sort_order:Number(byId('infoOrder')?.value||0),updated_at:new Date().toISOString()};
  const btn=byId('infoSaveBtn');if(btn){btn.disabled=true;btn.textContent='Saving...'}
  try{const q=id?sb.from('app_important_information').update(payload).eq('id',id):sb.from('app_important_information').insert({...payload,created_by:adminUser.id});const r=await q;if(r.error)throw r.error;toast(id?'Important Information update हो गई।':'Important Information save हो गई।','success');resetImportantInfoForm();await loadImportantInfoAdmin()}catch(e){toast(e.message||'Information save नहीं हुई।','error')}finally{if(btn){btn.disabled=false;if(btn.textContent==='Saving...')btn.textContent=id?'Update Important Information':'Save Important Information'}}
}
function editImportantInfo(id){const x=importantInformation.find(v=>String(v.id)===String(id));if(!x)return;byId('infoId').value=x.id;byId('infoTitle').value=x.title||'';byId('infoMessage').value=x.message||'';byId('infoActionLabel').value=x.action_label||'';byId('infoActionUrl').value=x.action_url||'';byId('infoVisible').checked=x.student_visible!==false;byId('infoPinned').checked=!!x.pinned;byId('infoOrder').value=Number(x.sort_order||0);byId('infoSaveBtn').textContent='Update Important Information';byId('infoCancelBtn').classList.remove('hidden')}
async function toggleImportantInfo(id,current){const r=await sb.from('app_important_information').update({student_visible:!current,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return toast(r.error.message,'error');await loadImportantInfoAdmin()}
async function toggleImportantPin(id,current){const r=await sb.from('app_important_information').update({pinned:!current,updated_at:new Date().toISOString()}).eq('id',id);if(r.error)return toast(r.error.message,'error');await loadImportantInfoAdmin()}
async function deleteImportantInfo(id){if(!confirm('यह Important Information delete करनी है?'))return;const r=await sb.from('app_important_information').delete().eq('id',id);if(r.error)return toast(r.error.message,'error');toast('Information delete हो गई।','success');await loadImportantInfoAdmin()}
async function loadImportantInfoAdmin(){
  const host=byId('infoList');if(!host)return;host.innerHTML='<div class="item">Information load हो रही है…</div>';const r=await sb.from('app_important_information').select('*').order('pinned',{ascending:false}).order('sort_order').order('created_at',{ascending:false});if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V15 SQL run करें।</small></div>`;return}importantInformation=r.data||[];host.innerHTML=importantInformation.map(x=>`<article class="v15-info-row"><div><span class="badge ${x.student_visible?'badge-green':'badge-gray'}">${x.student_visible?'Student Visible':'Hidden'}</span>${x.pinned?'<span class="badge badge-blue">Pinned</span>':''}</div><h3>${esc(x.title||'Important Information')}</h3>${x.message?`<p>${esc(x.message)}</p>`:''}<small>${new Date(x.created_at).toLocaleString('hi-IN')}</small><div class="v15-info-actions"><button class="btn btn-light btn-mini" onclick="editImportantInfo('${x.id}')">Edit</button><button class="btn btn-orange btn-mini" onclick="toggleImportantPin('${x.id}',${!!x.pinned})">${x.pinned?'Unpin':'Pin'}</button><button class="btn btn-blue btn-mini" onclick="toggleImportantInfo('${x.id}',${x.student_visible!==false})">${x.student_visible?'Hide':'Show'}</button><button class="btn btn-red btn-mini" onclick="deleteImportantInfo('${x.id}')">Delete</button></div></article>`).join('')||'<div class="item">अभी कोई Important Information नहीं है।</div>';
}
async function loadStudents(){
  const body=byId('studentsBody');if(body)body.innerHTML='<tr><td colspan="6">Students load हो रहे हैं…</td></tr>';const r=await sb.rpc('admin_list_students_v1230');if(r.error){if(body)body.innerHTML=`<tr><td colspan="6" class="text-error">${esc(r.error.message)}</td></tr>`;return}students=(r.data||[]).sort((a,b)=>String(b.registered_at||'').localeCompare(String(a.registered_at||'')));renderStudents(students);if(byId('studentsCount'))byId('studentsCount').textContent=`${students.length} Registered Students`;
}
function renderStudents(rows){const body=byId('studentsBody');if(!body)return;body.innerHTML=rows.map(s=>`<tr><td><b>${esc(s.full_name||'Student')}</b></td><td>${esc(s.email||'—')}</td><td>${esc(s.phone||'—')}</td><td>${s.registered_at?new Date(s.registered_at).toLocaleDateString('hi-IN'):'—'}</td><td><span class="badge ${s.is_active===false?'badge-gray':'badge-green'}">${s.is_active===false?'Inactive':'Active'}</span></td><td><button class="btn ${s.is_active===false?'btn-green':'btn-red'} btn-mini" onclick="toggleStudentStatus('${s.id}',${s.is_active!==false})">${s.is_active===false?'Activate':'Deactivate'}</button></td></tr>`).join('')||'<tr><td colspan="6">कोई Student नहीं मिला।</td></tr>'}
async function toggleStudentStatus(id,current){const r=await sb.rpc('admin_set_student_active_v1230',{p_student_id:id,p_active:!current});if(r.error)return toast(r.error.message,'error');toast(!current?'Student Active हो गया।':'Student Inactive हो गया।','success');loadStudents()}
function filterStudents(){const q=String(byId('studentSearch')?.value||'').toLowerCase().trim();renderStudents(!q?students:students.filter(s=>[s.full_name,s.email,s.phone].some(v=>String(v||'').toLowerCase().includes(q))))}
async function loadDashboard(){
  const host=byId('kpis');if(!host)return;let activeSeries=0,visibleSubjects=0,visibleClasses=0,visiblePosters=0;try{const [a,b,c,d]=await Promise.all([sb.from('cbt_test_series').select('id',{count:'exact',head:true}).eq('is_active',true),sb.from('cbt_subject_visibility').select('subject_key',{count:'exact',head:true}).eq('student_visible',true),sb.from('haryana_youtube_classes').select('id',{count:'exact',head:true}).eq('student_visible',true),sb.from('app_posters').select('id',{count:'exact',head:true}).eq('student_visible',true)]);activeSeries=a.count||0;visibleSubjects=b.count||0;visibleClasses=c.count||0;visiblePosters=d.count||0}catch(_){ }
  host.innerHTML=`<div class="kpi-card kpi-red span-3"><div class="muted">Active Fixed Test Series</div><div class="kpi">${activeSeries}</div></div><div class="kpi-card kpi-blue span-3"><div class="muted">Student Visible Subjects</div><div class="kpi">${visibleSubjects}</div></div><div class="kpi-card kpi-green span-3"><div class="muted">Haryana GK Classes</div><div class="kpi">${visibleClasses}</div></div><div class="kpi-card span-3"><div class="muted">Live Posters</div><div class="kpi">${visiblePosters}</div></div>`;
}
async function init(){
  if(!(await guard()))return;adminUser=await requireAuth();if(!adminUser)return;if(byId('todayDate'))byId('todayDate').textContent=new Date().toLocaleDateString('hi-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});initInstallUI('adminInstallBtn');fillHaryanaTopics();await Promise.all([loadYoutubeClasses(),loadPostersAdmin(),loadImportantInfoAdmin(),loadStudents()]);tab('cbt');
}
init();
