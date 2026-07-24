

/* ===== DIRECT ADMIN LOGIN + OWNER PASSWORD GATE ===== */
let __adminGateUnlocked=false;

function adminGateMessage(text,type='error'){
  const host=document.getElementById('adminGateMessage');
  if(!host)return;
  host.innerHTML=`<div class="notice notice-${type}">${esc(text)}</div>`;
}
function isAdminLoginEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim());
}
function showAdminAccountStep(message=''){
  document.getElementById('adminAccountLoginStep')?.classList.remove('hidden');
  document.getElementById('adminPanelPasswordStep')?.classList.add('hidden');
  document.getElementById('adminGateOverlay')?.classList.remove('hidden');
  document.body.classList.add('admin-security-pending');
  document.body.classList.remove('admin-authorized');
  if(message)adminGateMessage(message,'error');
}
function showAdminPanelPasswordStep(){
  document.getElementById('adminAccountLoginStep')?.classList.add('hidden');
  document.getElementById('adminPanelPasswordStep')?.classList.remove('hidden');
  document.getElementById('adminGateOverlay')?.classList.remove('hidden');
  document.body.classList.add('admin-security-pending');
  document.body.classList.remove('admin-authorized');
  const password=document.getElementById('adminGatePassword');
  if(password)setTimeout(()=>password.focus(),50);
}
async function verifyCurrentAdminSession(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return null;
  const profile=await getProfile(session.user.id);
  if(String(profile?.role||'').toLowerCase()!=='admin')return null;
  adminUser=session.user;
  return session.user;
}
async function submitAdminAccountLogin(){
  const loginId=document.getElementById('adminLoginId')?.value.trim()||'';
  const password=document.getElementById('adminLoginPassword')?.value||'';
  const btn=document.getElementById('adminAccountLoginButton');

  if(!loginId)return adminGateMessage('Registered Admin Email लिखें।');
  if(!isAdminLoginEmail(loginId)){
    return adminGateMessage('Mobile Number नहीं—Supabase में registered पूरा Admin Email लिखें।');
  }
  if(!password)return adminGateMessage('Admin Login Password लिखें।');

  if(btn){btn.disabled=true;btn.textContent='Checking Admin...'}
  try{
    const email=loginId.toLowerCase();

    // Clear any stale student/admin session before a fresh owner login.
    await sb.auth.signOut();

    const result=await sb.auth.signInWithPassword({email,password});
    if(result.error){
      throw new Error('Admin Email या Login Password गलत है।');
    }

    const profile=await getProfile(result.data.user.id);
    if(String(profile?.role||'').toLowerCase()!=='admin'){
      await sb.auth.signOut();
      throw new Error('यह account Admin नहीं है। Supabase profiles table में role = admin होना चाहिए।');
    }

    adminUser=result.data.user;
    adminGateMessage('Admin account verified. अब Extra Admin Panel Password डालें।','success');
    showAdminPanelPasswordStep();
  }catch(e){
    adminGateMessage(e.message||'Admin Login failed.');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Continue'}
  }
}
async function verifyAdminPanelPassword(password){
  const token=await getAccessToken();
  if(!token)throw new Error('Admin account login required');
  const base=String(APP_CONFIG.R2_PDF_API_URL||'').replace(/\/+$/,'');
  const res=await fetch(base+'/admin/panel-login',{
    method:'POST',
    headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify({password})
  });
  let data={};try{data=await res.json()}catch(_){}
  if(!res.ok||!data.success)throw new Error(data.error||'Admin Panel Password गलत है।');
  return true;
}
async function submitAdminGate(){
  const input=document.getElementById('adminGatePassword');
  const btn=document.getElementById('adminGateButton');
  const password=input?.value||'';
  if(!password)return adminGateMessage('Extra Admin Panel Password डालिए।');

  if(btn){btn.disabled=true;btn.textContent='Unlocking...'}
  try{
    const currentAdmin=await verifyCurrentAdminSession();
    if(!currentAdmin){
      sessionStorage.removeItem('gk_admin_gate_ok');
      showAdminAccountStep('Admin session समाप्त हो गई। दोबारा Login करें।');
      return;
    }
    await verifyAdminPanelPassword(password);
    __adminGateUnlocked=true;
    sessionStorage.setItem('gk_admin_gate_ok','1');
    document.getElementById('adminGateOverlay')?.classList.add('hidden');
    document.body.classList.add('admin-authorized');
    document.body.classList.remove('admin-security-pending');
    adminGateMessage('');
  }catch(e){
    sessionStorage.removeItem('gk_admin_gate_ok');
    adminGateMessage(e.message||'Access denied');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Unlock Admin Panel'}
  }
}
async function adminSwitchAccount(){
  sessionStorage.removeItem('gk_admin_gate_ok');
  __adminGateUnlocked=false;
  await sb.auth.signOut();
  const id=document.getElementById('adminLoginId');
  const pass=document.getElementById('adminLoginPassword');
  const panelPass=document.getElementById('adminGatePassword');
  if(id)id.value='';
  if(pass)pass.value='';
  if(panelPass)panelPass.value='';
  showAdminAccountStep();
}
async function guard(){
  const currentAdmin=await verifyCurrentAdminSession();

  if(!currentAdmin){
    sessionStorage.removeItem('gk_admin_gate_ok');
    showAdminAccountStep('Registered Admin Email और Admin Login Password से Login करें।');
    return new Promise(resolve=>{
      const timer=setInterval(()=>{
        if(__adminGateUnlocked){
          clearInterval(timer);
          resolve(true);
        }
      },250);
    });
  }

  if(sessionStorage.getItem('gk_admin_gate_ok')==='1'){
    __adminGateUnlocked=true;
    document.getElementById('adminGateOverlay')?.classList.add('hidden');
    document.body.classList.add('admin-authorized');
    document.body.classList.remove('admin-security-pending');
    return true;
  }

  showAdminPanelPasswordStep();
  return new Promise(resolve=>{
    const timer=setInterval(()=>{
      if(__adminGateUnlocked){
        clearInterval(timer);
        resolve(true);
      }
    },250);
  });
}

let adminUser=null,days=[],students=[],allTargets=[],publishedTests=[];
function tab(n,el){['dashboard','students','daysetup','targets','tests','oneliners','pdfs','posters','messages','reports'].forEach(x=>document.getElementById(x+'Tab').classList.toggle('hidden',x!==n));document.querySelectorAll('.sidebar a').forEach(a=>a.classList.remove('active'));if(el)el.classList.add('active');if(n==='posters'&&typeof loadPosters==='function')loadPosters()}

async function init(){if(!(await guard()))return;todayDate.textContent=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});await loadDays();await loadStudents();await Promise.all([loadDashboard(),loadTests(),loadOneLinersAdmin(),loadMaterials(),loadReports(),loadBroadcasts()])}
async function loadDays(){const r=await sb.from('schedule_days').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).order('day_number');days=r.data||[];const opts=days.map(d=>`<option value="${d.id}">Day ${d.day_number} — ${fmtDate(d.day_date)}</option>`).join('');targetDay.innerHTML=opts;setupDay.innerHTML=opts;pdfDay.innerHTML=opts;testDay.innerHTML='<option value="">No linked day</option>'+opts;await loadTargetStatus();
const vmDay=document.getElementById('verificationManagerDay');
if(vmDay)vmDay.innerHTML='<option value="">सभी Days</option>'+opts;
await loadDaySetup();
await loadVerificationManager();
}
async function loadStudents(){const r=await sb.from('profiles').select('*').eq('role','student').order('created_at',{ascending:false});students=r.data||[];renderStudents(students)}
function renderStudents(list){studentsBody.innerHTML=list.map(s=>`<tr><td><b>${esc(s.full_name||'')}</b></td><td>${esc(s.phone||'')}</td><td>${s.total_completed_days||0}/125</td><td>${s.average_test_percentage||0}%</td><td>${s.current_streak||0}</td></tr>`).join('')}
function filterStudents(){const q=studentSearch.value.toLowerCase();renderStudents(students.filter(s=>(s.full_name||'').toLowerCase().includes(q)||(s.phone||'').includes(q)))}
async function loadDashboard(){const today=new Date().toISOString().slice(0,10),d=await sb.from('schedule_days').select('id').eq('day_date',today).maybeSingle();let p=[];if(d.data){const rr=await sb.from('daily_progress').select('*').eq('schedule_day_id',d.data.id);p=rr.data||[]}const c=p.filter(x=>x.status==='completed').length,partial=p.filter(x=>x.status==='partial').length,not=p.filter(x=>x.status==='not_started').length;kpis.innerHTML=`<div class="kpi-card kpi-blue span-4"><div class="muted">Total Students</div><div class="kpi">${students.length}</div></div><div class="kpi-card kpi-green span-4"><div class="muted">Today Complete</div><div class="kpi">${c}</div></div><div class="kpi-card kpi-red span-4"><div class="muted">Not Started</div><div class="kpi">${not}</div></div>`}
async function loadDaySetup(){
  const dayId=setupDay.value||days[0]?.id;if(!dayId)return;
  const [t,v]=await Promise.all([
    sb.from('daily_targets').select('*').eq('schedule_day_id',dayId).order('target_order'),
    sb.from('verification_questions').select('*').eq('schedule_day_id',dayId).eq('is_active',true).order('created_at')
  ]);
  allTargets=t.data||[];
  const vmap={};(v.data||[]).forEach(x=>(vmap[x.target_id]??=[]).push(x));
  setupTargets.innerHTML=allTargets.map((x,idx)=>`<details class="target-setup-3d" ${idx===0?'open':''}>
    <summary>
      <div><span class="topic-chip">${esc(x.subject)}</span><b>${esc(x.topic)}</b></div>
      <span class="badge badge-blue">Target ${x.target_order}</span>
    </summary>
    <div class="target-setup-body">
      <label>YouTube Class Link</label>
      <div class="setup-inline"><input id="yt_${x.id}" value="${esc(x.youtube_url||'')}" placeholder="https://youtube.com/..."><button class="btn btn-red" onclick="saveYoutube('${x.id}')">Save Class Link</button></div>
      <div class="verification-builder-3d">
        <div class="row wrap" style="justify-content:space-between;align-items:center">
          <div><h4>Class Verification Questions</h4><div class="small muted">Mock Test की तरह पूरा Question + Options + उत्तर + व्याख्या एक साथ paste करें।</div></div>
          <div class="row wrap">
            <span class="badge badge-purple">Existing: ${(vmap[x.id]||[]).length}</span>
            ${(vmap[x.id]||[]).length?`<button class="btn btn-red btn-mini" onclick="deleteTargetVerifications('${x.id}','${dayId}')">🗑 Delete Verification</button>`:''}
          </div>
        </div>
        <label>Question Visibility</label>
        <select id="show_${x.id}"><option value="false">Hide Question — Student को केवल Options दिखें</option><option value="true">Show Question — Question + Options दोनों दिखें</option></select>
        <label>Verification Question Data</label>
        <textarea class="verification-raw-box" id="vqraw_${x.id}" placeholder="प्रश्न 1. ........
(A) ....
(B) ....
(C) ....
(D) ....
उत्तर: (A)
व्याख्या: ....

------

प्रश्न 2. ........"></textarea>
        <div class="format-tip"><b>Format:</b> आप 1, 2, 3 या जितने चाहें प्रश्न paste कर सकते हैं। Save करने पर पुराने verification questions replace हो जाएंगे।</div>
        <button class="btn btn-green" onclick="saveVerificationBatch('${x.id}','${dayId}')">Parse & Save Verification</button>
      </div>
    </div>
  </details>`).join('')
}

/* ===== GLOBAL CLASS VERIFICATION MANAGER ===== */
async function loadVerificationManager(){
  const host=document.getElementById('verificationManagerList');
  if(!host)return;

  host.innerHTML='<div class="item">Verification questions load हो रहे हैं...</div>';

  const selectedDay=document.getElementById('verificationManagerDay')?.value||'';
  let q=sb.from('verification_questions')
    .select('id,target_id,schedule_day_id,question_text,options,show_question,is_active,sort_order,created_at')
    .order('created_at',{ascending:false});

  if(selectedDay)q=q.eq('schedule_day_id',selectedDay);

  const [vr,tr,dr]=await Promise.all([
    q,
    sb.from('daily_targets').select('id,subject,topic,schedule_day_id,target_order'),
    sb.from('schedule_days').select('id,day_number,day_date')
  ]);

  if(vr.error){
    host.innerHTML='<div class="item text-error">'+esc(vr.error.message)+'</div>';
    return;
  }

  const targets={};
  (tr.data||[]).forEach(x=>targets[x.id]=x);
  const daysMap={};
  (dr.data||[]).forEach(x=>daysMap[x.id]=x);

  const rows=vr.data||[];
  if(!rows.length){
    host.innerHTML='<div class="item">कोई Verification Question मौजूद नहीं है।</div>';
    return;
  }

  host.innerHTML=rows.map(v=>{
    const target=targets[v.target_id]||null;
    const day=daysMap[v.schedule_day_id]||daysMap[target?.schedule_day_id]||null;
    const opts=Array.isArray(v.options)?v.options:[];
    const question=v.question_text||'Hidden Class Verification';
    const questionLabel=v.show_question===false?'Question Hidden — Student को केवल options दिखते हैं':'Question Visible';
    const activeLabel=v.is_active===false?'Inactive':'Active';

    return `<div class="verification-manager-item">
      <div class="verification-manager-meta">
        <span class="badge badge-blue">${day?`Day ${day.day_number}`:'Legacy / Day नहीं मिला'}</span>
        <span class="badge badge-purple">${target?esc(target.subject):'Legacy Verification'}</span>
        <span class="badge ${v.is_active===false?'badge-red':'badge-green'}">${activeLabel}</span>
      </div>

      <div class="verification-manager-topic">${target?esc(target.topic):'यह Question पुराने/legacy data से है'}</div>
      <div class="verification-manager-question">${esc(question)}</div>
      <div class="small muted">${esc(questionLabel)}</div>

      ${opts.length?`<div class="verification-manager-options">
        ${opts.map((o,i)=>`<div><b>${String.fromCharCode(65+i)}.</b> ${esc(String(o))}</div>`).join('')}
      </div>`:''}

      <div class="verification-manager-actions">
        ${v.target_id?`<button class="btn btn-orange btn-mini" onclick="deleteTargetVerifications('${v.target_id}','${v.schedule_day_id||''}')">🗑 इस Target के सभी Questions Delete</button>`:''}
        <button class="btn btn-red btn-mini" onclick="deleteSingleVerificationQuestion('${v.id}')">🗑 केवल यह Question Delete</button>
      </div>
    </div>`;
  }).join('');
}

async function deleteSingleVerificationQuestion(questionId){
  if(!(await adminConfirmDelete('क्या आप केवल यह Verification Question delete करना चाहते हैं?')))return;

  const rr=await sb.rpc('admin_delete_verification_question',{p_question_id:questionId});
  if(rr.error){
    toast('Verification delete नहीं हुआ: '+rr.error.message,'error');
    return;
  }

  toast('Verification Question delete हो गया।','success');
  await Promise.all([loadDaySetup(),loadVerificationManager()]);
}

async function deleteAllVerificationQuestions(){
  if(!(await adminConfirmDelete('क्या आप सभी पुराने और वर्तमान Verification Questions delete करना चाहते हैं? यह action वापस नहीं होगा।')))return;

  const rr=await sb.rpc('admin_delete_all_verification_questions');
  if(rr.error){
    toast('All Verification delete नहीं हुए: '+rr.error.message,'error');
    return;
  }

  toast('सभी Verification Questions delete हो गए।','success');
  await Promise.all([loadDaySetup(),loadVerificationManager()]);
}

async function saveYoutube(id){const url=document.getElementById('yt_'+id).value.trim();const rr=await sb.from('daily_targets').update({youtube_url:url||null}).eq('id',id);if(rr.error)toast(rr.error.message,'error');else toast('YouTube Class Link saved.','success')}

async function deleteTargetVerifications(targetId,dayId){
  if(!(await adminConfirmDelete('क्या आप इस Target के सभी Class Verification Questions delete करना चाहते हैं?')))return;
  const rr=await sb.rpc('admin_delete_target_verifications',{p_target_id:targetId});
  if(rr.error){toast('Verification delete नहीं हुआ: '+rr.error.message,'error');return}
  toast('Class Verification delete हो गया। अब इस Target के लिए verification नहीं मांगा जाएगा।','success');
  await Promise.all([loadDaySetup(),loadVerificationManager()]);
}

async function saveVerificationBatch(targetId,dayId){
  const raw=document.getElementById('vqraw_'+targetId).value.trim();
  const show=document.getElementById('show_'+targetId).value==='true';
  const parsed=parseRawQuestions(raw);
  if(!parsed.length){toast('Valid verification question नहीं मिला। Mock Test वाला format paste करें।','error');return}
  const items=parsed.map((q,i)=>({
    question_text:q.question_text||'Class Verification',
    options:q.options,
    correct_answer:String(q.correct_answer),
    explanation:q.explanation||null,
    sort_order:i+1
  }));
  const rr=await sb.rpc('admin_replace_target_verifications',{
    p_target_id:targetId,
    p_schedule_day_id:dayId,
    p_show_question:show,
    p_items:items
  });
  if(rr.error){toast('Verification save नहीं हुआ: '+rr.error.message,'error');return}
  toast(parsed.length+' Verification Question save हो गए।','success');
  document.getElementById('vqraw_'+targetId).value='';
  await Promise.all([loadDaySetup(),loadVerificationManager()]);
}
async function loadTargetStatus(){const dayId=targetDay.value||days[0]?.id;if(!dayId)return;const r=await sb.from('daily_progress').select('*,profiles(full_name)').eq('schedule_day_id',dayId);const rows=r.data||[],c=rows.filter(x=>x.status==='completed').length,partial=rows.filter(x=>x.status==='partial').length,not=rows.filter(x=>x.status==='not_started').length;targetStatusCards.innerHTML=`<div class="kpi-card kpi-green span-4"><div class="muted">Completed</div><div class="kpi">${c}</div></div><div class="kpi-card kpi-orange span-4"><div class="muted">Partial</div><div class="kpi">${partial}</div></div><div class="kpi-card kpi-red span-4"><div class="muted">Not Started</div><div class="kpi">${not}</div></div>`;targetStatusBody.innerHTML=rows.map(x=>`<tr><td>${esc(x.profiles?.full_name||'')}</td><td>${x.completed_targets}/${x.total_targets}</td><td>${x.test_score_percent??'-'}%</td><td>${esc(x.status)}</td><td>${x.status==='completed'?'Excellent 🌹':x.feedback==='test_pending'?'Final Test Pass करें 📝':x.status==='partial'?'Target पूरा करें ⚠️':'Work Complete नहीं हुआ ❌'}</td></tr>`).join('');renderDayUnlockState()}
function currentSelectedDay(){return days.find(d=>String(d.id)===String(targetDay.value))||days[0]}function renderDayUnlockState(){const d=currentSelectedDay();if(!d)return;let txt=d.manual_lock?'🔒 Manually Locked':d.manual_unlock?'🔓 Manually Unlocked':'⏱ Automatic — Date-wise';dayUnlockState.innerHTML=`<span class="lock-chip ${d.manual_lock||d.manual_unlock?'manual':'auto'}">${txt}</span>`}
async function setDayUnlock(mode){const d=currentSelectedDay(),patch=mode==='lock'?{manual_lock:true,manual_unlock:false}:mode==='unlock'?{manual_lock:false,manual_unlock:true}:{manual_lock:false,manual_unlock:false};const r=await sb.from('schedule_days').update(patch).eq('id',d.id).select().single();if(r.error){toast(r.error.message,'error');return}Object.assign(d,r.data);renderDayUnlockState();toast('Day unlock setting updated.','success')}
function detectType(text){const t=text.toLowerCase();if(/अभिकथन|assertion/.test(t)&&/कारण|reason/.test(t))return'assertion_reason';if(/निष्कर्ष|conclusion/.test(t))return'statement_conclusion';if(/मिलान|सूची\s*[-–]?\s*i|list\s*[-–]?\s*i/.test(t))return'matching';if(/क्रमानुसार|सही क्रम|chronolog/.test(t))return'chronology';if(/रिक्त स्थान|____|fill in/.test(t))return'fill_blank';if(/सही कूट|correct code|कूट चुन/.test(t))return'correct_code';if(/विषम|odd one out/.test(t))return'odd_one_out';if(/कथनों? की सत्यता|कौन[- ]?से कथन सही|सही कथन|सत्य\/असत्य|true\/false/.test(t))return'multiple_statement_correctness';if(/(^|\n)\s*[1-9][.)]\s+/.test(text))return'multi_statement';return'normal_mcq'}
function answerIndex(raw){const s=(raw||'').trim().replace(/[()\[\]]/g,'').toUpperCase(),m={A:0,B:1,C:2,D:3,'क':0,'ख':1,'ग':2,'घ':3,'1':0,'2':1,'3':2,'4':3};return m[s]??null}
function parseRawQuestions(raw){const clean=raw.replace(/\r/g,'').trim();if(!clean)return[];const starts=[...clean.matchAll(/(?:^|\n)\s*(?:प्रश्न|Question|Q)\s*(?:No\.?\s*)?(\d+)\s*[.):-]?\s*/gi)];let blocks=[];if(starts.length){for(let i=0;i<starts.length;i++){const a=starts[i].index+(starts[i][0].startsWith('\n')?1:0),b=i+1<starts.length?starts[i+1].index:clean.length;blocks.push(clean.slice(a,b).trim())}}else blocks=clean.split(/\n\s*\n(?=\S)/).filter(Boolean);const out=[];for(const b0 of blocks){let block=b0.replace(/^\s*(?:प्रश्न|Question|Q)\s*(?:No\.?\s*)?\d+\s*[.):-]?\s*/i,'').trim();const ansM=block.match(/\n\s*(?:उत्तर|Answer|Ans\.?|सही उत्तर)\s*[:：-]\s*\(?\s*([A-Da-dकखगघ1-4])\s*\)?/i);if(!ansM)continue;const expM=block.match(/\n\s*(?:व्याख्या|Explanation|Solution)\s*[:：-]\s*([\s\S]*)$/i),answer=answerIndex(ansM[1]);let content=block.slice(0,ansM.index).trim();const optRe=/(?:^|\n)\s*(?:\(([A-Da-dकखगघ])\)|([A-Da-dकखगघ])[.)])\s*([^\n]+)/g,opts=[];let m,first=-1;while((m=optRe.exec(content))){if(first<0)first=m.index+(m[0].startsWith('\n')?1:0);opts.push(m[3].trim())}if(opts.length!==4||answer===null)continue;const qtext=(first>=0?content.slice(0,first):content).trim();out.push({question_type:detectType(qtext),question_text:qtext,options:opts,correct_answer:answer,explanation:expM?expM[1].trim():null})}return out}
async function publishRawTest(){const parsed=parseRawQuestions(rawQuestions.value);if(!parsed.length){toast('Valid questions नहीं मिले। Format check करें।','error');return}const tr=await sb.from('tests').insert({batch_id:APP_CONFIG.BATCH_ID,schedule_day_id:testDay.value||null,title:testName.value.trim()||'New Test',test_type:'daily',total_questions:parsed.length,total_marks:parsed.length,time_limit_minutes:+testTime.value||null,passing_percent:+testPass.value||0,is_final_daily:isFinalDaily.checked,is_pdf_download_gate:isPdfGate.checked,allow_unlimited_retries:true,status:'published',created_by:adminUser.id}).select().single();if(tr.error){toast(tr.error.message,'error');return}for(let i=0;i<parsed.length;i++){const q=parsed[i],rr=await sb.from('test_questions').insert({test_id:tr.data.id,question_order:i+1,marks:1,difficulty:'normal',question_type:q.question_type,question_text:q.question_text,options:q.options}).select().single();if(rr.error){toast('Q'+(i+1)+': '+rr.error.message,'error');return}await sb.from('test_question_keys').insert({question_id:rr.data.id,correct_answer:q.correct_answer,explanation:q.explanation})}await createGlobalNotification('📝 नया Mock Test',tr.data.title+' उपलब्ध है।','test',tr.data.id);toast(parsed.length+' प्रश्नों का Test Publish हो गया।','success');rawQuestions.value='';loadTests()}
async function loadTests(){const r=await sb.from('tests').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).order('created_at',{ascending:false});publishedTests=r.data||[];adminTests.innerHTML=publishedTests.map(t=>`<div class="item"><b>${esc(t.title)}</b><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent||0}% ${t.is_final_daily?'• Final Daily':''}</div></div>`).join('');pdfTest.innerHTML='<option value="">No Test</option>'+publishedTests.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}
function parseOneLiners(raw){
  const text=String(raw||'').replace(/\r/g,'').trim();
  if(!text)return[];
  const out=[];
  for(const line0 of text.split('\n')){
    const line=line0.trim();
    if(!line)continue;
    const m=line.match(/^\s*(?:\d+\s*[.)-]?\s*)?(.+?)\s*(?:—|--|-)?\s*(?:उत्तर|Answer|Ans\.?)\s*[:：-]\s*(.+)\s*$/i);
    if(m&&m[1]&&m[2])out.push({question:m[1].trim().replace(/[—\-\s]+$/,''),answer:m[2].trim()});
  }
  if(out.length)return out;
  const lines=text.split('\n');let q=null;
  for(const l0 of lines){
    const l=l0.trim();if(!l)continue;
    const am=l.match(/^(?:उत्तर|Answer|Ans\.?)\s*[:：-]\s*(.+)$/i);
    if(am&&q){out.push({question:q,answer:am[1].trim()});q=null;continue}
    const qm=l.match(/^(?:प्रश्न|Question|Q)?\s*(?:\d+)?\s*[.):-]?\s*(.+)$/i);
    if(qm)q=qm[1].trim();
  }
  return out;
}
async function publishOneLiners(){
  const rows=parseOneLiners(oneLinerRaw.value);
  if(!rows.length){toast('One-Liner format नहीं मिला। उदाहरण: 1. प्रश्न — उत्तर: जवाब','error');return}
  const rr=await sb.rpc('admin_publish_one_liners',{
    p_subject:oneLinerSubject.value.trim()||'General',
    p_topic:oneLinerTopic.value.trim()||'General',
    p_items:rows
  });
  if(rr.error){toast('One-Liner save नहीं हुआ: '+rr.error.message,'error');return}
  await createGlobalNotification('📚 नए One-Liners',`${oneLinerTopic.value.trim()||'नए Topic'} के ${rows.length} One-Liners उपलब्ध हैं।`,'oneliner','');
  toast(rows.length+' One-Liners Publish हो गए।','success');
  oneLinerRaw.value='';
  await loadOneLinersAdmin();
}
async function loadOneLinersAdmin(){const r=await sb.from('one_liners').select('*').order('created_at',{ascending:false}).limit(100);adminOneLiners.innerHTML=(r.data||[]).map(x=>`<div class="item"><span class="topic-chip">${esc(x.subject||'General')} • ${esc(x.topic||'General')}</span><p><b>${esc(x.question)}</b></p><p>${esc(x.answer)}</p></div>`).join('')||'<div class="item">अभी कोई One-Liner नहीं है।</div>'}
async function uploadPdf(){const f=pdfFile.files[0];if(!f){toast('PDF चुनें','error');return}if(f.size>25*1024*1024){toast('PDF 25 MB से बड़ी है','error');return}const path=`${pdfDay.value}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`,up=await sb.storage.from('study-pdfs').upload(path,f,{contentType:'application/pdf'});if(up.error){toast(up.error.message,'error');return}const ins=await sb.from('study_materials').insert({schedule_day_id:pdfDay.value,title:pdfTitle.value.trim()||f.name,material_type:'pdf',storage_path:path,file_size_bytes:f.size,mime_type:'application/pdf',status:'published',access_mode:pdfAccess.value,download_test_id:pdfTest.value||null,download_pass_percent:+pdfPass.value||80,requires_class_verification:true,uploaded_by:adminUser.id,published_at:new Date().toISOString()}).select().single();if(ins.error){toast(ins.error.message,'error');return}await createGlobalNotification('📄 नई PDF उपलब्ध',ins.data.title,'pdf',ins.data.id);toast('PDF upload हो गई','success');loadMaterials()}
async function loadMaterials(){const r=await sb.from('study_materials').select('*,schedule_days(day_number)').order('created_at',{ascending:false});materialsList.innerHTML=(r.data||[]).map(m=>`<div class="item"><b>${esc(m.title)}</b><div class="muted">Day ${m.schedule_days?.day_number||'-'} • ${m.access_mode||'read_only'} ${m.access_mode==='test_required'?`• ${m.download_pass_percent}%`:''}</div></div>`).join('')}
async function createGlobalNotification(title,message,relatedType,relatedId){await sb.from('app_notifications').insert({title,message,notification_type:'info',related_type:relatedType||null,related_id:String(relatedId||'')||null,is_active:true})}
async function sendBroadcast(){const title=broadcastTitle.value.trim(),message=broadcastMessage.value.trim();if(!title||!message){toast('Title और Message लिखें।','error');return}const rr=await sb.from('broadcast_messages').insert({title,message,message_type:broadcastType.value,is_active:true}).select().single();if(rr.error){toast(rr.error.message,'error');return}await createGlobalNotification(title,message,'broadcast',rr.data.id);broadcastTitle.value='';broadcastMessage.value='';toast('संदेश सभी विद्यार्थियों को भेज दिया गया।','success');loadBroadcasts()}
async function deleteBroadcast(id){
  if(!(await adminConfirmDelete('क्या आप यह पुराना Message delete करना चाहते हैं?')))return;
  const rr=await sb.rpc('admin_delete_broadcast',{p_broadcast_id:id});
  if(rr.error){toast('Message delete नहीं हुआ: '+rr.error.message,'error');return}
  toast('पुराना Message delete हो गया।','success');
  await loadBroadcasts();
}
async function deleteAllBroadcasts(){
  if(!(await adminConfirmDelete('क्या आप सभी पुराने Broadcast Messages delete करना चाहते हैं?')))return;
  const rr=await sb.rpc('admin_delete_all_broadcasts');
  if(rr.error){toast('Messages delete नहीं हुए: '+rr.error.message,'error');return}
  toast('सभी पुराने Messages delete हो गए।','success');
  await loadBroadcasts();
}
async function loadBroadcasts(){
  const r=await sb.from('broadcast_messages').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(100);
  broadcastList.innerHTML=(r.data||[]).map(x=>`<div class="item notice-premium ${esc(x.message_type||'info')} broadcast-admin-item"><div class="broadcast-copy"><b>${esc(x.title)}</b><p>${esc(x.message)}</p><div class="small muted">${x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):''}</div></div><button class="btn btn-red btn-mini" onclick="deleteBroadcast(${x.id})">🗑 Delete</button></div>`).join('')||'<div class="item">अभी कोई Broadcast नहीं है।</div>'
}
async function loadReports(){const top=[...students].sort((a,b)=>(b.total_completed_days||0)-(a.total_completed_days||0)||(b.average_test_percentage||0)-(a.average_test_percentage||0)).slice(0,5);reportCards.innerHTML=`<div class="kpi-card kpi-green span-4"><div class="muted">Completed Days</div><div class="kpi">${students.reduce((a,s)=>a+(s.total_completed_days||0),0)}</div></div><div class="kpi-card kpi-blue span-4"><div class="muted">Students</div><div class="kpi">${students.length}</div></div><div class="kpi-card kpi-purple span-4"><div class="muted">Average Score</div><div class="kpi">${students.length?Math.round(students.reduce((a,s)=>a+(s.average_test_percentage||0),0)/students.length):0}%</div></div>`;topStudents.innerHTML=top.map((s,i)=>`<tr><td>${i+1}</td><td>${esc(s.full_name||'')}</td><td>${s.total_completed_days||0}/125</td><td>${s.average_test_percentage||0}%</td></tr>`).join('')}

/* ===== REFINED ADMIN: SUBJECT/TOPIC CATALOG ===== */
let adminOneLinerCatalog=[];
async function loadAdminOneLinerCatalog(){
  const r=await sb.from('daily_targets').select('subject,topic').eq('status','published').order('subject').order('topic');
  adminOneLinerCatalog=r.data||[];
  const subjects=[...new Set(adminOneLinerCatalog.map(x=>(x.subject||'').trim()).filter(Boolean))];
  oneLinerSubject.innerHTML=subjects.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
  updateAdminOneLinerTopics();
}
function updateAdminOneLinerTopics(){
  const subject=oneLinerSubject?.value||'';
  const topics=[...new Set(adminOneLinerCatalog.filter(x=>x.subject===subject).map(x=>(x.topic||'').trim()).filter(Boolean))];
  oneLinerTopic.innerHTML=topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
}
async function loadOneLinersAdmin(){
  const r=await sb.from('one_liners').select('subject,topic,id').eq('status','published').order('subject').order('topic');
  const rows=r.data||[];
  const groups={};
  rows.forEach(x=>{
    const k=(x.subject||'General')+'||'+(x.topic||'General');
    groups[k]=(groups[k]||0)+1;
  });
  adminOneLiners.innerHTML=Object.entries(groups).map(([k,count])=>{
    const [subject,topic]=k.split('||');
    return `<div class="item one-topic-summary"><span class="topic-chip">${esc(subject)}</span><b>${esc(topic)}</b><span class="badge badge-blue">${count} One-Liners</span></div>`;
  }).join('')||'<div class="item">अभी कोई One-Liner नहीं है।</div>';
}
const __oldAdminInit=init;
init=async function(){
  if(!(await guard()))return;
  todayDate.textContent=new Date().toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'});
  await loadDays();
  await loadStudents();
  await loadAdminOneLinerCatalog();
  await Promise.all([loadDashboard(),loadTests(),loadOneLinersAdmin(),loadMaterials(),loadReports(),loadBroadcasts()]);
  initInstallUI('adminInstallBtn');
};


/* ===== ADMIN DELETE CONTROLS ===== */
async function adminConfirmDelete(message){
  return window.confirm(message);
}
async function deleteOneLiner(id){
  if(!(await adminConfirmDelete('क्या आप यह One-Liner delete करना चाहते हैं?'))) return;
  const r=await sb.rpc('admin_delete_one_liner',{p_one_liner_id:id});
  if(r.error){toast(r.error.message,'error');return}
  toast('One-Liner delete हो गया।','success');
  await loadOneLinersAdmin();
}
async function deleteOneLinerTopic(subject,topic){
  if(!(await adminConfirmDelete(`क्या "${subject} → ${topic}" के सभी One-Liners delete करने हैं?`))) return;
  const r=await sb.rpc('admin_delete_one_liner_topic',{p_subject:subject,p_topic:topic});
  if(r.error){toast(r.error.message,'error');return}
  toast('इस Topic के सभी One-Liners delete हो गए।','success');
  await loadOneLinersAdmin();
}
async function deleteAllOneLiners(){
  if(!(await adminConfirmDelete('क्या आप सभी One-Liners delete करना चाहते हैं? यह action वापस नहीं होगा।'))) return;
  const r=await sb.rpc('admin_delete_all_one_liners');
  if(r.error){toast(r.error.message,'error');return}
  toast('सभी One-Liners delete हो गए।','success');
  await loadOneLinersAdmin();
}

async function deleteQuestion(questionId,testId){
  if(!(await adminConfirmDelete('क्या आप केवल यह Question delete करना चाहते हैं?'))) return;
  const r=await sb.rpc('admin_delete_test_question',{p_question_id:questionId});
  if(r.error){toast(r.error.message,'error');return}
  toast('Question delete हो गया।','success');
  await loadTests();
  if(testId) await loadTestQuestionsAdmin(testId);
}
async function deleteTest(testId){
  if(!(await adminConfirmDelete('क्या आप पूरा Test और उसके सभी Questions delete करना चाहते हैं?'))) return;
  const r=await sb.rpc('admin_delete_test',{p_test_id:testId});
  if(r.error){toast(r.error.message,'error');return}
  toast('पूरा Test delete हो गया।','success');
  await loadTests();
}
async function deleteAllTests(){
  if(!(await adminConfirmDelete('क्या आप सभी Tests और उनके सभी Questions delete करना चाहते हैं?'))) return;
  const r=await sb.rpc('admin_delete_all_tests');
  if(r.error){toast(r.error.message,'error');return}
  toast('सभी Tests delete हो गए।','success');
  await loadTests();
}
async function loadTestQuestionsAdmin(testId){
  const host=document.getElementById('testQuestions_'+testId);
  if(!host)return;
  const r=await sb.from('test_questions').select('id,question_text,sort_order').eq('test_id',testId).order('sort_order');
  const rows=r.data||[];
  host.innerHTML=rows.map((q,i)=>`<div class="admin-delete-row"><div><b>Q${i+1}.</b> ${esc(q.question_text||'')}</div><button class="btn btn-red btn-mini" onclick="deleteQuestion('${q.id}','${testId}')">Delete Question</button></div>`).join('')||'<div class="muted">इस Test में कोई Question नहीं है।</div>';
}

async function deletePdf(materialId,storagePath){
  if(!(await adminConfirmDelete('क्या आप यह PDF पूरी तरह delete करना चाहते हैं?'))) return;
  const r=await sb.rpc('admin_delete_material',{p_material_id:materialId});
  if(r.error){toast(r.error.message,'error');return}
  if(storagePath){
    try{await sb.storage.from('study-pdfs').remove([storagePath]);}catch(_){}
  }
  toast('PDF delete हो गई।','success');
  await loadMaterials();
}
async function deleteAllPdfs(){
  if(!(await adminConfirmDelete('क्या आप सभी PDFs delete करना चाहते हैं?'))) return;
  const list=await sb.from('study_materials').select('id,storage_path');
  const rows=list.data||[];
  const r=await sb.rpc('admin_delete_all_materials');
  if(r.error){toast(r.error.message,'error');return}
  const paths=rows.map(x=>x.storage_path).filter(Boolean);
  if(paths.length){try{await sb.storage.from('study-pdfs').remove(paths);}catch(_){}}
  toast('सभी PDFs delete हो गईं।','success');
  await loadMaterials();
}

/* Enrich published One-Liner listing with topic delete + individual expand/delete */
const __deleteOldLoadOneLinersAdmin = typeof loadOneLinersAdmin==='function' ? loadOneLinersAdmin : null;
loadOneLinersAdmin=async function(){
  const r=await sb.from('one_liners').select('id,subject,topic,question,answer,created_at').eq('status','published').order('subject').order('topic').order('created_at');
  const rows=r.data||[];
  const groups={};
  rows.forEach(x=>{
    const k=(x.subject||'General')+'||'+(x.topic||'General');
    (groups[k] ||= []).push(x);
  });
  adminOneLiners.innerHTML=Object.entries(groups).map(([k,items])=>{
    const [subject,topic]=k.split('||');
    const safeKey=btoa(unescape(encodeURIComponent(k))).replace(/=/g,'');
    return `<div class="item admin-delete-group">
      <div class="row wrap">
        <div><span class="topic-chip">${esc(subject)}</span><b>${esc(topic)}</b><span class="badge badge-blue">${items.length} One-Liners</span></div>
        <div class="row wrap">
          <button class="btn btn-light btn-mini" onclick="document.getElementById('olgrp_${safeKey}').classList.toggle('hidden')">View</button>
          <button class="btn btn-red btn-mini" onclick='deleteOneLinerTopic(${JSON.stringify(subject)},${JSON.stringify(topic)})'>Delete Topic</button>
        </div>
      </div>
      <div id="olgrp_${safeKey}" class="hidden admin-delete-inner">
        ${items.map((x,i)=>`<div class="admin-delete-row"><div><b>${i+1}. ${esc(x.question||'')}</b><div class="muted">उत्तर: ${esc(x.answer||'')}</div></div><button class="btn btn-red btn-mini" onclick="deleteOneLiner('${x.id}')">Delete</button></div>`).join('')}
      </div>
    </div>`;
  }).join('')||'<div class="item">अभी कोई One-Liner नहीं है।</div>';
};

/* Enrich tests listing with delete and question manager */
const __deleteOldLoadTests = typeof loadTests==='function' ? loadTests : null;
loadTests=async function(){
  const r=await sb.from('tests').select('*').order('created_at',{ascending:false});
  const rows=r.data||[];
  if(typeof adminTests!=='undefined' && adminTests){
    adminTests.innerHTML=rows.map(t=>`<div class="item admin-delete-group">
      <div class="row wrap">
        <div><b>${esc(t.title||'Untitled Test')}</b><div class="muted">${t.total_questions||0} Questions • Pass ${t.passing_percent||0}%</div></div>
        <div class="row wrap">
          <button class="btn btn-light btn-mini" onclick="loadTestQuestionsAdmin('${t.id}');document.getElementById('testQuestions_${t.id}').classList.toggle('hidden')">Manage Questions</button>
          <button class="btn btn-red btn-mini" onclick="deleteTest('${t.id}')">Delete Test</button>
        </div>
      </div>
      <div id="testQuestions_${t.id}" class="hidden admin-delete-inner"></div>
    </div>`).join('')||'<div class="item">अभी कोई Test नहीं है।</div>';
  }
};

/* Enrich PDF listing with delete buttons */
const __deleteOldLoadMaterials = typeof loadMaterials==='function' ? loadMaterials : null;
loadMaterials=async function(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date)').order('created_at',{ascending:false});
  const rows=r.data||[];
  if(typeof adminPdfs!=='undefined' && adminPdfs){
    adminPdfs.innerHTML=rows.map(m=>`<div class="item admin-delete-group"><div class="row wrap"><div><b>📄 ${esc(m.title||'PDF')}</b><div class="muted">Day ${m.schedule_days?.day_number||'-'} • ${esc(m.access_mode||'')}</div></div><button class="btn btn-red btn-mini" onclick='deletePdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")})'>Delete PDF</button></div></div>`).join('')||'<div class="item">अभी कोई PDF नहीं है।</div>';
  }
};



/* ===== R2 PDF STORAGE OVERRIDES ===== */
async function uploadPdf(){
  const f=pdfFile.files[0];
  if(!f){toast('PDF चुनें','error');return}
  if(f.type && f.type!=='application/pdf'){toast('केवल PDF file upload करें।','error');return}
  if(f.size>95*1024*1024){toast('एक PDF अधिकतम 95 MB रखें।','error');return}

  const btn=document.querySelector('#pdfsTab button[onclick="uploadPdf()"]')||document.querySelector('button[onclick="uploadPdf()"]');
  const oldText=btn?.textContent||'Upload PDF';
  if(btn){btn.disabled=true;btn.textContent='Uploading to R2...';}

  let uploadedKey=null;
  try{
    const uploadRes=await r2ApiFetch(
      `/admin/upload?filename=${encodeURIComponent(f.name)}`,
      {method:'PUT',headers:{'Content-Type':'application/pdf','X-File-Name':f.name},body:f}
    );
    if(!uploadRes.ok)throw new Error(await r2ErrorMessage(uploadRes,'R2 upload failed'));
    const uploadData=await uploadRes.json();
    uploadedKey=uploadData.key;
    if(!uploadedKey)throw new Error('R2 file key नहीं मिला।');

    const ins=await sb.from('study_materials').insert({
      schedule_day_id:pdfDay.value,
      title:pdfTitle.value.trim()||f.name,
      material_type:'pdf',
      storage_path:uploadedKey,
      file_size_bytes:f.size,
      mime_type:'application/pdf',
      status:'published',
      access_mode:pdfAccess.value,
      download_test_id:pdfTest.value||null,
      download_pass_percent:+pdfPass.value||80,
      requires_class_verification:true,
      uploaded_by:adminUser.id,
      published_at:new Date().toISOString()
    }).select().single();

    if(ins.error){
      try{
        await r2ApiFetch(`/admin/file?key=${encodeURIComponent(uploadedKey)}`,{method:'DELETE'});
      }catch(_){}
      throw new Error(ins.error.message);
    }

    await createGlobalNotification('📄 नई PDF उपलब्ध',ins.data.title,'pdf',ins.data.id);
    pdfTitle.value='';
    pdfFile.value='';
    toast('PDF Cloudflare R2 में upload हो गई।','success');
    await loadMaterials();
  }catch(e){
    console.error(e);
    toast(e.message||'PDF upload नहीं हो पाई।','error');
  }finally{
    if(btn){btn.disabled=false;btn.textContent=oldText;}
  }
}

async function deletePdf(materialId,storagePath){
  if(!(await adminConfirmDelete('क्या आप यह PDF पूरी तरह delete करना चाहते हैं?')))return;

  const db=await sb.rpc('admin_delete_material',{p_material_id:materialId});
  if(db.error){toast(db.error.message,'error');return}

  try{
    if(isR2PdfPath(storagePath)){
      const rr=await r2ApiFetch(`/admin/file?key=${encodeURIComponent(storagePath)}`,{method:'DELETE'});
      if(!rr.ok)console.warn(await r2ErrorMessage(rr,'R2 delete failed'));
    }else if(storagePath){
      await sb.storage.from('study-pdfs').remove([storagePath]);
    }
  }catch(e){
    console.warn('File cleanup warning:',e);
  }

  toast('PDF delete हो गई।','success');
  await loadMaterials();
}

async function deleteAllPdfs(){
  if(!(await adminConfirmDelete('क्या आप सभी PDFs delete करना चाहते हैं?')))return;

  const list=await sb.from('study_materials').select('id,storage_path');
  const rows=list.data||[];
  const db=await sb.rpc('admin_delete_all_materials');
  if(db.error){toast(db.error.message,'error');return}

  for(const row of rows){
    try{
      if(isR2PdfPath(row.storage_path)){
        await r2ApiFetch(`/admin/file?key=${encodeURIComponent(row.storage_path)}`,{method:'DELETE'});
      }else if(row.storage_path){
        await sb.storage.from('study-pdfs').remove([row.storage_path]);
      }
    }catch(e){console.warn('Cleanup warning',row.storage_path,e)}
  }

  toast('सभी PDFs delete हो गईं।','success');
  await loadMaterials();
}

const __r2BaseLoadMaterials=loadMaterials;
loadMaterials=async function(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date)').order('created_at',{ascending:false});
  const rows=r.data||[];
  if(typeof adminPdfs!=='undefined'&&adminPdfs){
    adminPdfs.innerHTML=rows.map(m=>`
      <div class="item admin-delete-group">
        <div class="row wrap">
          <div>
            <b>📄 ${esc(m.title||'PDF')}</b>
            <div class="muted">Day ${m.schedule_days?.day_number||'-'} • ${esc(m.access_mode||'')}</div>
            <div class="small">${isR2PdfPath(m.storage_path)?'☁ Cloudflare R2':'Legacy Supabase Storage'}</div>
          </div>
          <button class="btn btn-red btn-mini" onclick='deletePdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")})'>Delete PDF</button>
        </div>
      </div>`).join('')||'<div class="item">अभी कोई PDF नहीं है।</div>';
  }else if(typeof materialsList!=='undefined'&&materialsList){
    materialsList.innerHTML=rows.map(m=>`<div class="item"><b>${esc(m.title)}</b><div class="muted">Day ${m.schedule_days?.day_number||'-'} • ${m.access_mode||'read_only'}</div></div>`).join('');
  }
};



/* ===== FINAL PDF DELETE UI FIX ===== */
loadMaterials=async function(){
  const r=await sb.from('study_materials')
    .select('*,schedule_days(day_number,day_date)')
    .order('created_at',{ascending:false});

  const rows=r.data||[];
  const host=document.getElementById('materialsList');
  if(!host)return;

  host.innerHTML=rows.map(m=>`
    <div class="item admin-delete-group">
      <div class="row wrap" style="justify-content:space-between;align-items:center">
        <div>
          <b>📄 ${esc(m.title||'PDF')}</b>
          <div class="muted">
            Day ${m.schedule_days?.day_number||'-'} • ${esc(m.access_mode||'read_only')}
          </div>
          <div class="small">
            ${isR2PdfPath(m.storage_path)?'☁ Cloudflare R2':'Legacy Supabase Storage'}
          </div>
        </div>
        <button class="btn btn-red btn-mini"
          onclick='deletePdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")})'>
          🗑 Delete PDF
        </button>
      </div>
    </div>
  `).join('')||'<div class="item">अभी कोई PDF नहीं है।</div>';
};



/* ===== POSTER / BANNER MANAGEMENT ===== */
let posterObjectUrls=[];
function clearPosterObjectUrls(){posterObjectUrls.forEach(u=>URL.revokeObjectURL(u));posterObjectUrls=[]}

async function posterPreviewUrl(key){
  const res=await r2ApiFetch(`/poster?key=${encodeURIComponent(key)}`);
  if(!res.ok)throw new Error(await r2ErrorMessage(res,'Poster load failed'));
  const blob=await res.blob();
  const url=URL.createObjectURL(blob);
  posterObjectUrls.push(url);
  return url;
}

async function publishPoster(){
  const f=document.getElementById('posterFile')?.files?.[0];
  if(!f){toast('Poster image चुनें','error');return}
  if(!f.type.startsWith('image/')){toast('केवल image file चुनें','error');return}
  if(f.size>5*1024*1024){toast('Poster 5 MB से कम रखें।','error');return}

  const title=document.getElementById('posterTitle').value.trim()||'Poster';
  const link=document.getElementById('posterLink').value.trim()||null;
  const start=document.getElementById('posterStart').value||null;
  const end=document.getElementById('posterEnd').value||null;
  const active=document.getElementById('posterActive').value==='true';
  const order=Number(document.getElementById('posterOrder').value||0);

  let key=null;
  try{
    const up=await r2ApiFetch(`/admin/poster-upload?filename=${encodeURIComponent(f.name)}`,{
      method:'POST',
      headers:{'Content-Type':f.type,'X-File-Name':f.name},
      body:f
    });
    if(!up.ok)throw new Error(await r2ErrorMessage(up,'Poster upload failed'));
    key=(await up.json()).key;

    const ins=await sb.from('app_posters').insert({
      title:title,image_key:key,click_url:link,
      start_at:start?new Date(start).toISOString():null,
      end_at:end?new Date(end).toISOString():null,
      is_active:active,sort_order:order,created_by:adminUser.id
    });
    if(ins.error){
      try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(key)}`,{method:'DELETE'})}catch(_){}
      throw ins.error;
    }

    ['posterTitle','posterLink','posterStart','posterEnd'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});
    document.getElementById('posterFile').value='';
    document.getElementById('posterOrder').value='0';
    toast('Poster publish हो गया।','success');
    await loadPosters();
  }catch(e){
    console.error(e);
    toast(e.message||'Poster publish नहीं हुआ।','error');
  }
}

async function deletePoster(id,key){
  if(!(await adminConfirmDelete('क्या आप यह Poster delete करना चाहते हैं?')))return;
  const del=await sb.from('app_posters').delete().eq('id',id);
  if(del.error){toast(del.error.message,'error');return}
  try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(key)}`,{method:'DELETE'})}catch(e){console.warn(e)}
  toast('Poster delete हो गया।','success');
  await loadPosters();
}

async function deleteAllPosters(){
  if(!(await adminConfirmDelete('क्या आप सभी पुराने Posters permanently delete करना चाहते हैं?')))return;
  const r=await sb.from('app_posters').select('id,image_key');
  if(r.error){toast(r.error.message,'error');return}
  const rows=r.data||[];
  if(!rows.length){toast('Delete करने के लिए कोई Poster नहीं है।','info');return}
  const del=await sb.from('app_posters').delete().in('id',rows.map(x=>x.id));
  if(del.error){toast(del.error.message,'error');return}
  for(const p of rows){try{await r2ApiFetch(`/admin/poster?key=${encodeURIComponent(p.image_key)}`,{method:'DELETE'})}catch(e){console.warn(e)}}
  toast('सभी Posters delete हो गए।','success');
  await loadPosters();
}

async function togglePoster(id,current){
  const up=await sb.from('app_posters').update({is_active:!current}).eq('id',id);
  if(up.error){toast(up.error.message,'error');return}
  await loadPosters();
}

async function loadPosters(){
  const host=document.getElementById('posterList');
  if(!host)return;
  clearPosterObjectUrls();

  const r=await sb.from('app_posters').select('*').order('sort_order').order('created_at',{ascending:false});
  const rows=r.data||[];
  if(r.error){host.innerHTML='<div class="item text-error">'+esc(r.error.message)+'</div>';return}
  if(!rows.length){host.innerHTML='<div class="item">अभी कोई Poster नहीं है।</div>';return}

  const cards=[];
  for(const p of rows){
    let img='';
    try{img=await posterPreviewUrl(p.image_key)}catch(_){}
    cards.push(`<div class="item admin-delete-group">
      <div class="poster-admin-card">
        ${img?`<img src="${img}" class="poster-admin-thumb" alt="">`:''}
        <div class="poster-admin-info">
          <b>${esc(p.title||'Poster')}</b>
          <div class="small muted">${p.is_active?'Active':'Inactive'} • Order ${p.sort_order||0}</div>
          <div class="row wrap" style="margin-top:8px">
            <button class="btn btn-blue btn-mini" onclick='togglePoster(${JSON.stringify(p.id)},${p.is_active})'>${p.is_active?'Deactivate':'Activate'}</button>
            <button class="btn btn-red btn-mini" onclick='deletePoster(${JSON.stringify(p.id)},${JSON.stringify(p.image_key)})'>🗑 Delete</button>
          </div>
        </div>
      </div>
    </div>`);
  }
  host.innerHTML=cards.join('');
}

init();
