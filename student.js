
window.addEventListener('error',function(){
  try{
    const host=document.getElementById('homeBox')||document.querySelector('main')||document.body;
    if(host && !document.getElementById('studentRuntimeError')){
      const box=document.createElement('div');
      box.id='studentRuntimeError';
      box.className='card';
      box.style.cssText='margin:18px;padding:18px;border-left:6px solid #dc2626;font-weight:800;';
      box.innerHTML='<b>Student Panel load नहीं हो पाया।</b><div style="margin-top:8px;font-weight:600">कृपया Ctrl + F5 करके page refresh करें।</div>';
      host.prepend(box);
    }
  }catch(_){}
});

let user=null,profile=null,currentDay=null,currentTargets=[],targetCompletionMap=new Map(),verificationRows=[],materials=[],tests=[];
const SUBJECT_CLASS={"Maths":"subject-maths","Mathematics":"subject-maths","Reasoning":"subject-reasoning","Haryana GK":"subject-haryana","Hindi":"subject-hindi","Science":"subject-science","Polity":"subject-polity","History":"subject-history","Geography":"subject-geography","Static GK":"subject-static","Computer":"subject-computer","BNS/BNSS/BSA":"subject-law"};
function tab(name,el){["home","targets","tests","oneliners","pdfs","notifications","profile"].forEach(x=>document.getElementById(x+"Tab").classList.toggle("hidden",x!==name));document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.remove("active"));if(el)el.classList.add("active")}
function sclass(s){return SUBJECT_CLASS[s]||"subject-other"}
async function init(){registerSW();user=await requireAuth();if(!user)return;profile=await getProfile(user.id);await loadCurrentDay();await Promise.all([renderHome(),renderTargets(),loadTests(),loadOneLiners(),loadPdfs(),loadNotifications(),renderProfile()])}
async function loadCurrentDay(){const today=new Date().toISOString().slice(0,10);let r=await sb.from("schedule_days").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).eq("manual_lock",false).or(`manual_unlock.eq.true,and(manual_unlock.eq.false,day_date.lte.${today})`).order("day_number",{ascending:false}).limit(1).maybeSingle();currentDay=r.data;if(!currentDay)return;const [tr,tc,vr,mr,te]=await Promise.all([sb.from("daily_targets").select("*").eq("schedule_day_id",currentDay.id).eq("status","published").order("target_order"),sb.from("target_completions").select("*").eq("user_id",user.id),sb.from("verification_questions").select("*").eq("schedule_day_id",currentDay.id).eq("is_active",true).order("created_at"),sb.from("study_materials").select("*").eq("schedule_day_id",currentDay.id).eq("status","published").order("created_at"),sb.from("tests").select("*").eq("schedule_day_id",currentDay.id).eq("status","published").order("created_at")]);currentTargets=tr.data||[];(tc.data||[]).forEach(x=>targetCompletionMap.set(x.target_id,x));verificationRows=vr.data||[];materials=mr.data||[];tests=te.data||[]}
function finalTest(){return tests.filter(t=>t.is_final_daily).slice(-1)[0]||null}
async function bestAttempt(testId){if(!testId)return null;const r=await sb.from("test_attempts").select("*").eq("user_id",user.id).eq("test_id",testId).eq("status","submitted").order("percentage",{ascending:false}).limit(1);return r.data?.[0]||null}
async function renderHome(){if(!currentDay){homeBox.innerHTML='<div class="card">आज का Target उपलब्ध नहीं है।</div>';return}const ft=finalTest(),fa=await bestAttempt(ft?.id),done=currentTargets.filter(t=>targetCompletionMap.has(t.id)).length,total=currentTargets.length,passed=!ft||(fa&&fa.percentage>=ft.passing_percent);const status=done===0?'Work Complete नहीं हुआ है ❌':done<total?'आज का Target पूरा करें ⚠️':!passed?'Final Test Pass करना बाकी है 📝':'आज का Target Complete 🎉';homeBox.innerHTML=`<div class="hello">Hello, ${esc(profile?.full_name||'Student')} 👋</div><div class="muted">Day ${currentDay.day_number} • ${fmtDate(currentDay.day_date)}</div><div class="status-hero hero-premium"><div class="small">आज का संदेश</div><h2>${status}</h2><p>Class → Verification → PDF → Final Mock Test → Target Complete</p></div><div class="workflow-steps"><div class="workflow-step ${done?'done':''}"><div class="workflow-icon">▶️</div><div class="workflow-title">Class</div></div><div class="workflow-step ${done?'done':''}"><div class="workflow-icon">✅</div><div class="workflow-title">Verification</div></div><div class="workflow-step ${materials.length?'done':''}"><div class="workflow-icon">📄</div><div class="workflow-title">PDF</div></div><div class="workflow-step ${passed&&done===total?'done':''}"><div class="workflow-icon">📝</div><div class="workflow-title">Final Test</div></div></div><div class="stat-row" style="margin-top:12px"><div class="stat-mini"><div class="muted">Targets</div><div class="kpi">${done}/${total}</div></div><div class="stat-mini"><div class="muted">Streak</div><div class="kpi">${profile?.current_streak||0}</div></div></div>`}
function targetVerifications(targetId){return verificationRows.filter(v=>String(v.target_id)===String(targetId))}
async function renderTargets(){if(!currentDay){targetsBox.innerHTML='<div class="card">No target.</div>';return}let html=`<div class="row wrap"><div><h3>Day ${currentDay.day_number}</h3><div class="muted">${fmtDate(currentDay.day_date)}</div></div></div>`;for(const t of currentTargets){const done=targetCompletionMap.has(t.id),vs=targetVerifications(t.id);html+=`<div class="target-card ${sclass(t.subject)}"><div class="small">${esc(t.subject)}</div><div class="topic">${esc(t.topic)}</div>${t.youtube_url?`<p><a class="btn btn-red" target="_blank" href="${esc(t.youtube_url)}">▶ Watch YouTube Class</a></p>`:'<p class="small">Class link अभी add नहीं किया गया।</p>'}<div>${done?'<span class="badge badge-green">Verified & Completed ✓</span>':'<span class="badge badge-orange">Verification Pending</span>'}</div></div>`;if(!done&&vs.length){for(const v of vs){const opts=Array.isArray(v.options)?v.options:[];html+=`<div class="verify-card"><h4>Class Verification</h4>${v.show_question?`<p><b>${esc(v.question_text)}</b></p>`:'<p class="muted"><b>Question class में पूछा गया था। सही option चुनिए।</b></p>'}<div class="choice-grid" id="choices_${v.id}">${opts.map((o,i)=>`<button class="choice-option" onclick="selectVerifyOption('${v.id}',${i},this)">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div><input type="hidden" id="vq_${v.id}"><div style="height:8px"></div><button class="btn btn-green" onclick="verifyTarget('${v.id}','${t.id}')">Submit Answer</button><div id="vres_${v.id}" class="small" style="margin-top:8px"></div></div>`}}}const ft=finalTest();if(ft)html+=`<div class="card final-test-card"><div class="row wrap"><div><b>Daily Final Mock Test</b><div class="muted">Pass: ${ft.passing_percent}% • ${ft.total_questions} Questions</div></div><a class="btn btn-purple btn-blue" href="test.html?id=${ft.id}">Start Final Test</a></div></div>`;targetsBox.innerHTML=html}
function selectVerifyOption(id,i,el){document.querySelectorAll(`#choices_${id} .choice-option`).forEach(x=>x.classList.remove('selected'));el.classList.add('selected');document.getElementById('vq_'+id).value=String(i)}
async function verifyTarget(vId,targetId){
  const answer=document.getElementById('vq_'+vId)?.value;
  if(answer===''||answer===undefined){toast('पहले कोई एक option चुनिए।','error');return}
  const r=await sb.rpc('submit_target_verification',{p_verification_question_id:vId,p_target_id:targetId,p_answer:answer});
  const box=document.getElementById('vres_'+vId);
  if(r.error){toast(r.error.message,'error');return}
  if(r.data===true){
    const v=verificationRows.find(x=>String(x.id)===String(vId));
    box.innerHTML='<span class="badge badge-green">✅ Correct Answer</span>'+(v?.explanation?`<div class="verification-explanation"><b>व्याख्या:</b> ${esc(v.explanation)}</div>`:'');
    const card=box.closest('.verify-card'); if(card){card.querySelectorAll('button.choice-option').forEach(b=>b.disabled=true);const sbt=card.querySelector('button.btn-green');if(sbt)sbt.disabled=true}
    const done=await sb.from('target_completions').select('target_id').eq('user_id',user.id).eq('target_id',targetId).maybeSingle();
    if(done.data){
      targetCompletionMap.set(targetId,{target_id:targetId});
      await sb.rpc('refresh_daily_progress',{p_user_id:user.id,p_schedule_day_id:currentDay.id});
      box.innerHTML+='<div style="margin-top:8px"><span class="badge badge-green">🎉 सभी Verification सही — Target Verified</span></div>';
      setTimeout(async()=>{await renderTargets();await renderHome()},850)
    }else{
      box.innerHTML+='<div class="small muted" style="margin-top:8px">इस Target के बाकी verification question भी सही करें।</div>'
    }
  }else{
    box.innerHTML='<span class="badge badge-red">❌ Answer Wrong — Try Again</span>'
  }
}
async function loadTests(){const r=await sb.from('tests').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).eq('status','published').order('created_at',{ascending:false});testsList.innerHTML=(r.data||[]).map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title)}</b><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent||0}%${t.is_final_daily?' • Final Daily Test':''}</div></div><a class="btn btn-blue" href="test.html?id=${t.id}">Start Test</a></div></div>`).join('')||'<div class="card">अभी कोई Test नहीं है।</div>'}
let oneLinerRows=[];async function loadOneLiners(){const r=await sb.from('one_liners').select('*').eq('status','published').order('subject').order('topic').order('created_at');oneLinerRows=r.data||[];const subjects=[...new Set(oneLinerRows.map(x=>x.subject||'General'))];oneLinerFilters.innerHTML=`<label>Subject</label><select id="olSubject" onchange="renderOneLiners()"><option value="">All Subjects</option>${subjects.map(s=>`<option>${esc(s)}</option>`).join('')}</select><label style="margin-top:8px">Topic</label><select id="olTopic" onchange="renderOneLiners()"><option value="">All Topics</option></select>`;document.getElementById('olSubject').addEventListener('change',updateTopicFilter);updateTopicFilter();renderOneLiners()}
function updateTopicFilter(){const s=document.getElementById('olSubject')?.value||'';const topics=[...new Set(oneLinerRows.filter(x=>!s||(x.subject||'General')===s).map(x=>x.topic||'General'))];document.getElementById('olTopic').innerHTML='<option value="">All Topics</option>'+topics.map(t=>`<option>${esc(t)}</option>`).join('');renderOneLiners()}
function renderOneLiners(){const s=document.getElementById('olSubject')?.value||'',t=document.getElementById('olTopic')?.value||'';const rows=oneLinerRows.filter(x=>(!s||(x.subject||'General')===s)&&(!t||(x.topic||'General')===t));const groups={};rows.forEach(x=>{const k=x.topic||'General';(groups[k]??=[]).push(x)});oneLinersList.innerHTML=Object.entries(groups).map(([topic,items])=>`<div class="topic-group"><div class="topic-group-title">${esc(topic)}</div>${items.map((x,i)=>`<div class="item"><span class="topic-chip">${esc(x.subject||'General')}</span><p><b>${i+1}. ${esc(x.question)}</b></p><p><span class="badge badge-green">उत्तर</span> ${esc(x.answer)}</p></div>`).join('')}</div>`).join('')||'<div class="card">कोई One-Liner नहीं मिला।</div>'}
async function loadPdfs(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock)').eq('status','published').order('created_at',{ascending:false});
  const today=new Date().toISOString().slice(0,10);
  const rows=(r.data||[]).filter(m=>{
    const d=m.schedule_days;if(!d)return true;
    if(d.manual_lock)return false;
    return d.manual_unlock||d.day_date<=today;
  });
  pdfList.innerHTML=rows.map(m=>`<div class="item pdf-read-card"><div class="row wrap"><div><b>${esc(m.title)}</b><div class="muted">Day ${m.schedule_days?.day_number||'-'} • ${m.access_mode==='direct_download'?'Direct Download':m.access_mode==='test_required'?`Test Gate ${m.download_pass_percent}%`:'Read Only'}</div></div><div class="row wrap"><button class="btn btn-blue" onclick="readPdf('${m.id}','${m.storage_path}','${esc(m.title)}')">Read PDF</button>${m.access_mode!=='read_only'?`<button class="btn btn-green" onclick="downloadPdf('${m.id}','${m.storage_path}')">Download</button>`:''}</div></div></div>`).join('')||'<div class="card">अभी कोई PDF नहीं है।</div>'
}
async function readPdf(id,path,title){
  const ok=await sb.rpc('can_read_material',{p_material_id:id});
  if(ok.error){
    showActionNotice("PDF खोलने में समस्या आई: "+ok.error.message,"",null,"error");
    return;
  }
  if(!ok.data){
    showActionNotice(
      "पहले Class Verification पूरा करें, तभी यह PDF खुलेगी।",
      "Verification यहाँ से करें",
      ()=>openTodayVerification(),
      "warning"
    );
    return;
  }
  const r=await sb.storage.from('study-pdfs').createSignedUrl(path,120);
  if(r.error){
    showActionNotice("PDF खोलने में समस्या आई: "+r.error.message,"",null,"error");
    return;
  }
  window.open(r.data.signedUrl,'_blank','noopener');
}
async function downloadPdf(id,path){const ok=await sb.rpc('can_download_material',{p_material_id:id});if(ok.error){toast(ok.error.message,'error');return}if(!ok.data){toast('PDF Download Locked — Required Test passing score पूरा करें।','error');return}const rr=await sb.storage.from('study-pdfs').createSignedUrl(path,120);if(rr.error){toast(rr.error.message,'error');return}const a=document.createElement('a');a.href=rr.data.signedUrl;a.download='study-material.pdf';a.target='_blank';a.click()}
async function renderProfile(){profileBox.innerHTML=`<div class="card"><h3>${esc(profile?.full_name||'Student')}</h3><p>Mobile: ${esc(profile?.phone||'')}</p><p>Completed Days: ${profile?.total_completed_days||0}</p><p>Average Test: ${profile?.average_test_percentage||0}%</p><p>Current Streak: ${profile?.current_streak||0}</p><button class="btn btn-red" onclick="logout()">Logout</button></div>`}
let notificationRows=[];async function loadNotifications(){const [br,ar,reads]=await Promise.all([sb.from('broadcast_messages').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(50),sb.from('app_notifications').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(50),sb.from('student_notification_reads').select('broadcast_id').eq('student_id',user.id)]);const readSet=new Set((reads.data||[]).map(x=>String(x.broadcast_id)));const broadcasts=(br.data||[]).map(x=>({id:'b_'+x.id,rawId:x.id,title:x.title,message:x.message,type:x.message_type||'info',created_at:x.created_at,unread:!readSet.has(String(x.id)),isBroadcast:true}));const auto=(ar.data||[]).filter(x=>x.related_type!=='broadcast').map(x=>({id:'a_'+x.id,title:x.title,message:x.message,type:x.notification_type||'info',created_at:x.created_at,unread:false,isBroadcast:false}));notificationRows=[...broadcasts,...auto].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));const unread=notificationRows.filter(x=>x.unread).length,b=document.getElementById('notificationBadge');if(b){b.textContent=unread;b.classList.toggle('hidden',!unread)}renderNotifications()}
function renderNotifications(){notificationsList.innerHTML=notificationRows.map(x=>`<div class="item notice-premium ${esc(x.type)}"><div class="row"><b>${esc(x.title)}</b>${x.unread?'<span class="badge badge-red">NEW</span>':''}</div><p>${esc(x.message)}</p><div class="small muted">${new Date(x.created_at).toLocaleString('en-IN')}</div></div>`).join('')||'<div class="card">अभी कोई Notification नहीं है।</div>'}
function openNotifications(){tab('notifications');markAllNotificationsRead()}
async function markAllNotificationsRead(){for(const x of notificationRows.filter(x=>x.unread&&x.isBroadcast)){await sb.from('student_notification_reads').upsert({student_id:user.id,broadcast_id:x.rawId},{onConflict:'student_id,broadcast_id'})}await loadNotifications()}

/* ===== REFINED STUDENT FLOW ===== */
let previewDays=[],previewTargets=[],oneLinerPage=1;
const ONE_LINER_PAGE_SIZE=25;

async function loadFiveDayPreview(){
  const all=await sb.from('schedule_days').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).order('day_number');
  const daysAll=all.data||[];
  let start=0;
  if(currentDay){
    const idx=daysAll.findIndex(d=>String(d.id)===String(currentDay.id));
    start=idx<0?0:idx;
  }else{
    const today=new Date().toISOString().slice(0,10);
    const idx=daysAll.findIndex(d=>d.day_date>=today);
    start=idx<0?Math.max(0,daysAll.length-5):idx;
  }
  previewDays=daysAll.slice(start,start+5);
  if(!previewDays.length){previewTargets=[];return}
  const r=await sb.from('daily_targets').select('*').in('schedule_day_id',previewDays.map(d=>d.id)).eq('status','published').order('target_order');
  previewTargets=r.data||[];
}

function fiveDayPreviewHtml(){
  if(!previewDays.length)return '';
  return `<div class="card five-day-preview"><div class="row wrap"><div><h3>📅 अगले 5 दिनों का Target Preview</h3><div class="muted">Topics दिखाई देंगे; future Class/PDF date/admin unlock से पहले नहीं खुलेंगे।</div></div></div>
  <div class="preview-day-grid">${previewDays.map(d=>{
    const isCurrent=currentDay&&String(d.id)===String(currentDay.id);
    const topics=previewTargets.filter(t=>String(t.schedule_day_id)===String(d.id));
    return `<div class="preview-day-card ${isCurrent?'current-preview':''}">
      <div class="row wrap"><b>Day ${d.day_number}</b><span class="badge ${isCurrent?'badge-green':'badge-gray'}">${isCurrent?'Available':'Preview'}</span></div>
      <div class="muted">${fmtDate(d.day_date)}</div>
      <div class="preview-topic-list">${topics.map(t=>`<div class="preview-topic"><span class="topic-chip">${esc(t.subject)}</span>${esc(t.topic)}</div>`).join('')}</div>
    </div>`;
  }).join('')}</div></div>`;
}

const __baseRenderTargets=renderTargets;
renderTargets=async function(){
  if(!currentDay){
    targetsBox.innerHTML=fiveDayPreviewHtml()||'<div class="card">अभी Target उपलब्ध नहीं है।</div>';
    return;
  }
  let html=fiveDayPreviewHtml()+`<div class="row wrap"><div><h3>आज का Active Target — Day ${currentDay.day_number}</h3><div class="muted">${fmtDate(currentDay.day_date)}</div></div></div>`;
  for(const t of currentTargets){
    const done=targetCompletionMap.has(t.id),vs=targetVerifications(t.id);
    html+=`<div class="target-card ${sclass(t.subject)}"><div class="small">${esc(t.subject)}</div><div class="topic">${esc(t.topic)}</div>${t.youtube_url?`<p><a class="btn btn-red" target="_blank" rel="noopener" href="${esc(t.youtube_url)}">▶ Watch YouTube Class</a></p>`:'<p class="small">Class link अभी add नहीं किया गया।</p>'}<div>${done?'<span class="badge badge-green">Verified & Completed ✓</span>':'<span class="badge badge-orange">Verification Pending</span>'}</div></div>`;
    if(!done&&vs.length){
      for(const v of vs){
        const opts=Array.isArray(v.options)?v.options:[];
        html+=`<div class="verify-card"><h4>Class Verification</h4>${v.show_question?`<p><b>${esc(v.question_text)}</b></p>`:'<p class="muted"><b>Question class में पूछा गया था। सही option चुनिए।</b></p>'}<div class="choice-grid" id="choices_${v.id}">${opts.map((o,i)=>`<button class="choice-option" onclick="selectVerifyOption('${v.id}',${i},this)">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div><input type="hidden" id="vq_${v.id}"><div style="height:8px"></div><button class="btn btn-green" onclick="verifyTarget('${v.id}','${t.id}')">Submit Answer</button><div id="vres_${v.id}" class="small" style="margin-top:8px"></div></div>`;
      }
    }
  }
  const ft=finalTest();
  if(ft)html+=`<div class="card final-test-card"><div class="row wrap"><div><b>Daily Final Mock Test</b><div class="muted">Pass: ${ft.passing_percent}% • ${ft.total_questions} Questions</div></div><a class="btn btn-blue" href="test.html?id=${ft.id}">Start Final Test</a></div></div>`;
  targetsBox.innerHTML=html;
};

function updateTopicFilter(){
  const s=document.getElementById('olSubject')?.value||'';
  const topics=[...new Set(oneLinerRows.filter(x=>!s||(x.subject||'General')===s).map(x=>x.topic||'General'))];
  const topicEl=document.getElementById('olTopic');
  if(!topicEl)return;
  topicEl.innerHTML=topics.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  oneLinerPage=1;
  renderOneLiners();
}
async function loadOneLiners(){
  const r=await sb.from('one_liners').select('*').eq('status','published').order('subject').order('topic').order('created_at');
  oneLinerRows=r.data||[];
  const subjects=[...new Set(oneLinerRows.map(x=>x.subject||'General'))];
  if(!subjects.length){
    oneLinerFilters.innerHTML='<div class="muted">अभी कोई One-Liner publish नहीं है।</div>';
    oneLinersList.innerHTML='';
    return;
  }
  oneLinerFilters.innerHTML=`<label>Subject</label><select id="olSubject" onchange="updateTopicFilter()">${subjects.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}</select><label style="margin-top:8px">Topic</label><select id="olTopic" onchange="oneLinerPage=1;renderOneLiners()"></select>`;
  updateTopicFilter();
}
function renderOneLiners(){
  const s=document.getElementById('olSubject')?.value||'',t=document.getElementById('olTopic')?.value||'';
  const rows=oneLinerRows.filter(x=>(!s||(x.subject||'General')===s)&&(!t||(x.topic||'General')===t));
  const pages=Math.max(1,Math.ceil(rows.length/ONE_LINER_PAGE_SIZE));
  oneLinerPage=Math.min(Math.max(1,oneLinerPage),pages);
  const start=(oneLinerPage-1)*ONE_LINER_PAGE_SIZE;
  const pageRows=rows.slice(start,start+ONE_LINER_PAGE_SIZE);
  oneLinersList.innerHTML=`<div class="one-liner-book-page"><div class="book-page-head"><div><span class="topic-chip">${esc(s)}</span><h3>${esc(t)}</h3></div><span class="badge badge-blue">Page ${oneLinerPage}/${pages}</span></div>
    <div class="book-one-liners">${pageRows.map((x,i)=>`<div class="book-line"><b>${start+i+1}. ${esc(x.question)}</b><div class="book-answer">उत्तर: ${esc(x.answer)}</div></div>`).join('')}</div>
    ${rows.length>ONE_LINER_PAGE_SIZE?`<div class="book-pagination"><button class="btn btn-light" ${oneLinerPage<=1?'disabled':''} onclick="oneLinerPage--;renderOneLiners()">← Previous</button><button class="btn btn-blue" ${oneLinerPage>=pages?'disabled':''} onclick="oneLinerPage++;renderOneLiners()">Next →</button></div>`:''}
  </div>`;
}

async function loadPdfs(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock)').eq('status','published').order('created_at',{ascending:false});
  const rows=r.data||[];
  materials=rows;
  pdfList.innerHTML=rows.map(m=>`<div class="item pdf-read-card"><div class="row wrap"><div><b>📄 ${esc(m.title)}</b><div class="muted">Day ${m.schedule_days?.day_number||'-'} • PDF दिखाई दे रही है; पढ़ने के लिए उस Day के required tasks complete करें।</div><div class="pdf-access-note">${m.access_mode==='direct_download'?'✅ Tasks के बाद Direct Download':m.access_mode==='test_required'?`🔒 Download के लिए Mock Test ${m.download_pass_percent}% पास करना होगा`:'👁 Read Only'}</div></div><div class="row wrap"><button class="btn btn-blue" onclick="readPdf('${m.id}','${m.storage_path}','${esc(m.title)}')">Read PDF</button>${m.access_mode!=='read_only'?`<button class="btn btn-green" onclick="downloadPdf('${m.id}','${m.storage_path}','${m.download_test_id||''}','${m.access_mode}',${Number(m.download_pass_percent||80)})">Download</button>`:''}</div></div></div>`).join('')||'<div class="card">अभी कोई PDF नहीं है।</div>';
}
async function downloadPdf(id,path,testId,mode,passPercent){
  const read=await sb.rpc('can_read_material',{p_material_id:id});
  if(read.error){toast(read.error.message,'error');return}
  if(!read.data){showActionNotice('पहले Class Verification पूरा करें, तभी PDF खुलेगी।','Verification यहाँ से करें',()=>openTodayVerification(),'warning');return}
  if(mode==='read_only'){toast('यह PDF Read Only है। Download उपलब्ध नहीं है।','error');return}
  const ok=await sb.rpc('can_download_material',{p_material_id:id});
  if(ok.error){toast(ok.error.message,'error');return}
  if(ok.data){
    const rr=await sb.storage.from('study-pdfs').createSignedUrl(path,120);
    if(rr.error){toast(rr.error.message,'error');return}
    const a=document.createElement('a');a.href=rr.data.signedUrl;a.download='study-material.pdf';a.target='_blank';a.click();return;
  }
  if(mode==='test_required'&&testId){
    toast(`PDF Download के लिए पहले Mock Test में ${passPercent}% score करें। Test खुल रहा है…`,'error');
    setTimeout(()=>location.href=`test.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`,900);
    return;
  }
  toast('PDF Download अभी Locked है।','error');
}

const __oldStudentInit=init;
init=async function(){
  registerSW();
  initInstallUI('studentInstallBtn');
  user=await requireAuth();if(!user)return;
  profile=await getProfile(user.id);
  await loadCurrentDay();
  await loadFiveDayPreview();
  await Promise.all([renderHome(),renderTargets(),loadTests(),loadOneLiners(),loadPdfs(),loadNotifications(),renderProfile()]);
  const wanted=new URLSearchParams(location.search).get('tab');
  if(wanted&&document.getElementById(wanted+'Tab'))tab(wanted,null);
};



/* ===== HOME STATUS MODEL — REQUIRED BY PREMIUM HOME ===== */
async function statusModel(){
  if(!currentDay){
    return {key:'notstarted',title:'आज का Target अभी उपलब्ध नहीं है',msg:'Target की निर्धारित तारीख या Admin unlock के बाद content उपलब्ध होगा।'};
  }
  const total=currentTargets.length;
  const done=currentTargets.filter(t=>targetCompletionMap.has(t.id)).length;
  const ft=finalTest();
  const fa=ft?await bestAttempt(ft.id):null;
  const finalPassed=!ft || (!!fa && Number(fa.percentage||0)>=Number(ft.passing_percent||0));

  if(total===0) return {key:'notstarted',title:'आज का Target अभी उपलब्ध नहीं है',msg:'Admin द्वारा आज का content publish होने का इंतजार करें।'};
  if(done===0) return {key:'notstarted',title:'Work Complete नहीं हुआ है ❌',msg:'आज की Class और Verification से शुरुआत करें।'};
  if(done<total) return {key:'pending',title:'आज का Target पूरा करें ⚠️',msg:`${total} में से ${done} Target verified हैं। बाकी target पूरा करें।`};
  if(ft && !finalPassed) return {key:'pending',title:'Final Test Pass करना बाकी है 📝',msg:`Daily Target complete करने के लिए Final Test में कम से कम ${ft.passing_percent||0}% score करें।`};
  return {key:'excellent',title:'आज का Target Complete 🎉',msg:'बहुत बढ़िया! आज का पूरा target सफलतापूर्वक complete हो गया।'};
}

/* ===== PREMIUM HOME ACTION CARDS / DAY TASK FLOW ===== */
function todayClassCardsHtml(){
  if(!currentTargets.length)return '<div class="empty-state">आज की कोई class target उपलब्ध नहीं है।</div>';
  return currentTargets.map(t=>{
    const hasClass=!!t.youtube_url;
    return `<div class="home-class-topic-card ${sclass(t.subject)}">
      <div class="home-card-topline"><span class="home-subject-pill">${esc(t.subject)}</span><span class="home-day-pill">Day ${currentDay?.day_number||'-'}</span></div>
      <h3>${esc(t.topic)}</h3>
      <div class="home-target-label">आज का Target</div>
      <p class="home-target-text">${esc(t.topic)}</p>
      ${hasClass?`<a class="btn btn-red premium-action-btn" target="_blank" rel="noopener" href="${esc(t.youtube_url)}">▶ Watch YouTube Class</a>`:''}
    </div>`;
  }).join('');
}

async function openTodayClasses(){
  const box=document.getElementById('homeDynamicPanel');
  if(!box)return;
  box.innerHTML=`<div class="premium-section-head"><div><span class="section-kicker">TODAY'S CLASSES</span><h2>आज की Classes</h2></div><button class="btn btn-light" onclick="closeHomePanel()">✕</button></div>
  <div class="home-class-grid">${todayClassCardsHtml()}</div>`;
  box.classList.remove('hidden');
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

function verificationCardsHtml(){
  let html='';
  for(const t of currentTargets){
    const vs=targetVerifications(t.id);
    if(!vs.length)continue;
    html+=`<div class="home-verification-topic-card">
      <div class="home-card-topline"><span class="home-subject-pill dark">${esc(t.subject)}</span><span class="badge ${targetCompletionMap.has(t.id)?'badge-green':'badge-orange'}">${targetCompletionMap.has(t.id)?'Verified Once':'Pending'}</span></div>
      <h3>${esc(t.topic)}</h3>
      <p class="muted">Verification question हर बार खुलेगा। हर नई submission में सही उत्तर देना जरूरी है।</p>
      ${vs.map(v=>{
        const opts=Array.isArray(v.options)?v.options:[];
        return `<div class="repeat-verification-card">
          ${v.show_question?`<p class="verification-question-text"><b>${esc(v.question_text)}</b></p>`:'<p class="muted"><b>Question class में पूछा गया था। सही option चुनिए।</b></p>'}
          <div class="choice-grid" id="home_choices_${v.id}">
            ${opts.map((o,i)=>`<button class="choice-option" onclick="selectHomeVerifyOption('${v.id}',${i},this)">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}
          </div>
          <input type="hidden" id="home_vq_${v.id}">
          <button class="btn btn-green premium-action-btn" onclick="submitHomeVerification('${v.id}','${t.id}')">Verify Answer</button>
          <div id="home_vres_${v.id}" class="small" style="margin-top:8px"></div>
        </div>`;
      }).join('')}
    </div>`;
  }
  return html||'<div class="empty-state">अभी कोई Verification Question उपलब्ध नहीं है।</div>';
}
function selectHomeVerifyOption(vId,index,el){
  document.getElementById('home_vq_'+vId).value=index;
  el.parentElement.querySelectorAll('.choice-option').forEach(x=>x.classList.remove('selected-choice'));
  el.classList.add('selected-choice');
}
async function submitHomeVerification(vId,targetId){
  const val=document.getElementById('home_vq_'+vId)?.value;
  const res=document.getElementById('home_vres_'+vId);
  if(val===''||val==null){if(res)res.innerHTML='<span class="text-error">पहले कोई option चुनिए।</span>';return}
  const r=await sb.rpc('submit_target_verification_option',{p_verification_question_id:vId,p_target_id:targetId,p_selected_option:Number(val)});
  if(r.error){if(res)res.innerHTML='<span class="text-error">'+esc(r.error.message)+'</span>';return}
  if(r.data===true){
    if(res)res.innerHTML='<span class="text-success">✅ Correct Answer — Verification Successful</span>';
    targetCompletionMap.set(targetId,{target_id:targetId});
    await renderHome();
  }else{
    if(res)res.innerHTML='<span class="text-error">❌ Answer Wrong — दोबारा सही उत्तर दीजिए।</span>';
  }
}

function openTodayVerification(){
  const box=document.getElementById('homeDynamicPanel');
  if(!box)return;
  box.innerHTML=`<div class="premium-section-head"><div><span class="section-kicker">VERIFICATION</span><h2>Class Verification</h2></div><button class="btn btn-light" onclick="closeHomePanel()">✕</button></div>
  <div class="home-verification-grid">${verificationCardsHtml()}</div>`;
  box.classList.remove('hidden');
  box.scrollIntoView({behavior:'smooth',block:'start'});
}

function openPdfLibrary(){
  tab('pdfs',document.querySelector('.bottom-nav button:nth-child(5)'));
  setTimeout(()=>document.getElementById('pdfsTab')?.scrollIntoView({behavior:'smooth'}),100);
}
function openTestsLibrary(){
  tab('tests',document.querySelector('.bottom-nav button:nth-child(3)'));
}
function openOneLinerLibrary(){
  tab('oneliners',document.querySelector('.bottom-nav button:nth-child(4)'));
}
function closeHomePanel(){
  const box=document.getElementById('homeDynamicPanel');
  if(box){box.classList.add('hidden');box.innerHTML='';}
}

const __premiumOldRenderHome=renderHome;
renderHome=async function(){
  const st=await statusModel();
  const classCount=currentTargets.filter(t=>t.youtube_url).length;
  const verificationCount=currentTargets.reduce((n,t)=>n+targetVerifications(t.id).length,0);
  const pdfCount=materials.length;
  const finalT=finalTest();
  homeBox.innerHTML=`<div class="premium-home-hero">
    <div><div class="hero-kicker">GK BY PURUSHOTAM SIR</div><div class="hello">Hello, ${esc(profile?.full_name||'Student')} 👋</div><div class="muted">आज का काम step-by-step पूरा करें।</div></div>
    <div class="hero-day-badge">DAY ${currentDay?.day_number||'-'}</div>
  </div>

  <div class="status-hero ${st.key}"><div class="small">आज का संदेश</div><h2>${esc(st.title)}</h2><p>${esc(st.msg)}</p></div>

  <div class="home-action-grid">
    <button class="home-action-card class-card" onclick="openTodayClasses()">
      <div class="action-icon">▶</div><div class="action-text"><span>Classes</span><b>${classCount} Available</b><small>आज की सभी class links और topics देखें</small></div>
    </button>
    <button class="home-action-card verify-card-home" onclick="openTodayVerification()">
      <div class="action-icon">✓</div><div class="action-text"><span>Verification</span><b>${verificationCount} Questions</b><small>Verification question बार-बार खोलकर answer करें</small></div>
    </button>
    <button class="home-action-card pdf-card-home" onclick="openPdfLibrary()">
      <div class="action-icon">PDF</div><div class="action-text"><span>PDF Library</span><b>${pdfCount} PDFs</b><small>PDF देखें; tasks complete होने पर open होगी</small></div>
    </button>
    <button class="home-action-card test-card-home" onclick="openTestsLibrary()">
      <div class="action-icon">T</div><div class="action-text"><span>Mock Test</span><b>${finalT?'Final Test Ready':'Tests'}</b><small>Daily और दूसरे published tests खोलें</small></div>
    </button>
    <button class="home-action-card one-card-home" onclick="openOneLinerLibrary()">
      <div class="action-icon">1L</div><div class="action-text"><span>One-Liners</span><b>Topic-wise</b><small>Published topic-wise one-liners पढ़ें</small></div>
    </button>
  </div>

  <div id="homeDynamicPanel" class="hidden premium-home-panel"></div>

  <div class="card today-target-summary"><h3>🎯 आज का Target</h3>
    <div class="target-summary-list">${currentTargets.map(t=>`<div class="target-summary-row"><span class="topic-chip">${esc(t.subject)}</span><b>${esc(t.topic)}</b><span class="badge ${targetCompletionMap.has(t.id)?'badge-green':'badge-orange'}">${targetCompletionMap.has(t.id)?'Verified':'Pending'}</span></div>`).join('')}</div>
  </div>

  <div class="stat-row" style="margin-top:10px"><div class="stat-mini"><div class="muted">Streak</div><div class="kpi">${profile?.current_streak||0} Days</div></div><div class="stat-mini"><div class="muted">Average Test</div><div class="kpi">${profile?.average_test_percentage||0}%</div></div></div>`;
};



/* ===== R2 PDF READ / DOWNLOAD OVERRIDES ===== */
async function openR2PdfResponse(response,title,download=false){
  const blob=await response.blob();
  const blobUrl=URL.createObjectURL(blob);
  if(download){
    const a=document.createElement('a');
    a.href=blobUrl;
    a.download=(title||'study-material.pdf').toLowerCase().endsWith('.pdf')?(title||'study-material.pdf'):(title||'study-material')+'.pdf';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(blobUrl),60000);
  }else{
    const w=window.open(blobUrl,'_blank','noopener');
    if(!w)location.href=blobUrl;
    setTimeout(()=>URL.revokeObjectURL(blobUrl),10*60*1000);
  }
}

async function readPdf(id,path,title){
  if(!isR2PdfPath(path)){
    const ok=await sb.rpc('can_read_material',{p_material_id:id});
    if(ok.error){showActionNotice('PDF खोलने में समस्या आई: '+ok.error.message,'',null,'error');return}
    if(!ok.data){
      showActionNotice('पहले Class Verification पूरा करें, तभी यह PDF खुलेगी।','Verification यहाँ से करें',()=>openTodayVerification(),'warning');
      return;
    }
    const legacy=await sb.storage.from('study-pdfs').createSignedUrl(path,120);
    if(legacy.error){showActionNotice('PDF खोलने में समस्या आई: '+legacy.error.message,'',null,'error');return}
    window.open(legacy.data.signedUrl,'_blank','noopener');
    return;
  }

  try{
    const res=await r2ApiFetch(`/material/${encodeURIComponent(id)}/read`);
    if(!res.ok){
      let data={};
      try{data=await res.json()}catch(_){}
      if(data.code==='VERIFICATION_REQUIRED'||res.status===403){
        showActionNotice(
          data.error||'पहले Class Verification पूरा करें, तभी PDF खुलेगी।',
          'Verification यहाँ से करें',
          ()=>openTodayVerification(),
          'warning'
        );
        return;
      }
      throw new Error(data.error||'PDF नहीं खुल पाई।');
    }
    await openR2PdfResponse(res,title,false);
  }catch(e){
    showActionNotice('PDF खोलने में समस्या आई: '+(e.message||'Unknown error'),'',null,'error');
  }
}

async function downloadPdf(id,path,testId='',mode='direct_download',passPercent=80,title='study-material.pdf'){
  if(mode==='read_only'){
    toast('यह PDF Read Only है। Download उपलब्ध नहीं है।','error');
    return;
  }

  if(!isR2PdfPath(path)){
    const read=await sb.rpc('can_read_material',{p_material_id:id});
    if(read.error){toast(read.error.message,'error');return}
    if(!read.data){
      showActionNotice('पहले Class Verification पूरा करें, तभी PDF खुलेगी।','Verification यहाँ से करें',()=>openTodayVerification(),'warning');
      return;
    }
    const ok=await sb.rpc('can_download_material',{p_material_id:id});
    if(ok.error){toast(ok.error.message,'error');return}
    if(ok.data){
      const rr=await sb.storage.from('study-pdfs').createSignedUrl(path,120);
      if(rr.error){toast(rr.error.message,'error');return}
      const a=document.createElement('a');a.href=rr.data.signedUrl;a.download=title||'study-material.pdf';a.target='_blank';a.click();return;
    }
    if(mode==='test_required'&&testId){
      toast(`PDF Download के लिए पहले Mock Test में ${passPercent}% score करें। Test खुल रहा है…`,'error');
      setTimeout(()=>location.href=`test.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`,900);
      return;
    }
    toast('PDF Download अभी Locked है।','error');
    return;
  }

  try{
    const res=await r2ApiFetch(`/material/${encodeURIComponent(id)}/download`);
    if(res.ok){
      await openR2PdfResponse(res,title,true);
      return;
    }

    let data={};
    try{data=await res.json()}catch(_){}

    if(data.code==='TEST_REQUIRED'&&mode==='test_required'&&testId){
      showActionNotice(
        `PDF Download के लिए पहले Mock Test में ${passPercent}% score करना जरूरी है।`,
        'Mock Test शुरू करें',
        ()=>{location.href=`test.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`},
        'warning'
      );
      return;
    }
    if(data.code==='VERIFICATION_REQUIRED'){
      showActionNotice(
        data.error||'पहले Class Verification पूरा करें।',
        'Verification यहाँ से करें',
        ()=>openTodayVerification(),
        'warning'
      );
      return;
    }
    throw new Error(data.error||'PDF Download locked है।');
  }catch(e){
    toast(e.message||'PDF Download नहीं हो पाई।','error');
  }
}

const __r2BaseLoadPdfs=loadPdfs;
loadPdfs=async function(){
  const r=await sb.from('study_materials')
    .select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock)')
    .eq('status','published')
    .order('created_at',{ascending:false});
  const rows=r.data||[];
  materials=rows;

  pdfList.innerHTML=rows.map(m=>`
    <div class="item pdf-read-card">
      <div class="row wrap">
        <div>
          <b>📄 ${esc(m.title)}</b>
          <div class="muted">Day ${m.schedule_days?.day_number||'-'} • PDF दिखाई दे रही है; पढ़ने के लिए required tasks complete करें।</div>
          <div class="pdf-access-note">${
            m.access_mode==='direct_download'
              ?'✅ Verification के बाद Direct Download'
              :m.access_mode==='test_required'
                ?`🔒 Download के लिए Mock Test ${m.download_pass_percent}% पास करना होगा`
                :'👁 Read Only'
          }</div>
          <div class="small">${isR2PdfPath(m.storage_path)?'☁ Cloudflare R2':'Legacy PDF'}</div>
        </div>
        <div class="row wrap">
          <button class="btn btn-blue" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.title||"PDF")})'>Read PDF</button>
          ${m.access_mode!=='read_only'
            ?`<button class="btn btn-green" onclick='downloadPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.download_test_id||"")},${JSON.stringify(m.access_mode)},${Number(m.download_pass_percent||80)},${JSON.stringify(m.title||"study-material.pdf")})'>Download</button>`
            :''
          }
        </div>
      </div>
    </div>`).join('')||'<div class="card">अभी कोई PDF नहीं है।</div>';
};



/* ===== PDF-SPECIFIC VERIFICATION FLOW FIX ===== */
let materialVerificationContext=null;

async function getMaterialVerificationContext(materialId){
  const mat=await sb.from('study_materials')
    .select('id,title,schedule_day_id,storage_path')
    .eq('id',materialId)
    .maybeSingle();

  if(mat.error)throw mat.error;
  if(!mat.data)return {material:null,targets:[],questions:[]};

  const [tr,vr]=await Promise.all([
    sb.from('daily_targets')
      .select('*')
      .eq('schedule_day_id',mat.data.schedule_day_id)
      .eq('status','published')
      .order('target_order'),
    sb.from('verification_questions')
      .select('*')
      .eq('schedule_day_id',mat.data.schedule_day_id)
      .eq('is_active',true)
      .order('sort_order')
      .order('created_at')
  ]);

  return {
    material:mat.data,
    targets:tr.data||[],
    questions:vr.data||[]
  };
}

function verificationOptionsArray(v){
  if(Array.isArray(v.options))return v.options;
  if(typeof v.options==='string'){
    try{
      const x=JSON.parse(v.options);
      return Array.isArray(x)?x:[];
    }catch(_){return []}
  }
  return [];
}

function showMaterialVerificationPanel(ctx){
  let host=document.getElementById('materialVerificationOverlay');
  if(!host){
    host=document.createElement('div');
    host.id='materialVerificationOverlay';
    host.className='material-verification-overlay';
    document.body.appendChild(host);
  }

  const targetMap=new Map((ctx.targets||[]).map(t=>[String(t.id),t]));
  const questions=ctx.questions||[];

  host.innerHTML=`
    <div class="material-verification-modal">
      <div class="row wrap" style="justify-content:space-between;align-items:center">
        <div>
          <div class="section-kicker">CLASS VERIFICATION</div>
          <h2 style="margin:4px 0">${esc(ctx.material?.title||'PDF Verification')}</h2>
          <div class="muted">सही उत्तर देने के बाद PDF खुलेगी। गलत उत्तर पर दोबारा प्रयास कर सकते हैं।</div>
        </div>
        <button class="global-action-notice-close" onclick="closeMaterialVerification()">✕</button>
      </div>

      <div class="material-verification-list">
        ${questions.map((v,index)=>{
          const opts=verificationOptionsArray(v);
          const target=targetMap.get(String(v.target_id));
          return `<div class="verify-card material-vq-card">
            <div class="small muted">${esc(target?.subject||'')} ${target?.topic?'• '+esc(target.topic):''}</div>
            ${v.show_question!==false?`<h3>${index+1}. ${esc(v.question_text||'Class Verification')}</h3>`:'<h3>Class में पूछे गए प्रश्न का सही विकल्प चुनिए</h3>'}
            <div id="mat_choices_${v.id}" class="verification-options">
              ${opts.map((o,i)=>`<button class="choice-option" onclick="selectMaterialVerifyOption('${v.id}',${i},this)">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}
            </div>
            <input type="hidden" id="mat_vq_${v.id}">
            <button class="btn btn-green" style="margin-top:10px" onclick="submitMaterialVerification('${v.id}','${v.target_id}')">Submit Answer</button>
            <div id="mat_vres_${v.id}" class="small" style="margin-top:8px"></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;

  host.classList.add('show');
}

function closeMaterialVerification(){
  const host=document.getElementById('materialVerificationOverlay');
  if(host){host.classList.remove('show');host.innerHTML='';}
}

function selectMaterialVerifyOption(vId,index,el){
  const input=document.getElementById('mat_vq_'+vId);
  if(input)input.value=String(index);
  el.parentElement.querySelectorAll('.choice-option').forEach(x=>x.classList.remove('selected-choice','selected'));
  el.classList.add('selected-choice');
}

async function submitMaterialVerification(vId,targetId){
  const val=document.getElementById('mat_vq_'+vId)?.value;
  const res=document.getElementById('mat_vres_'+vId);

  if(val===''||val==null){
    if(res)res.innerHTML='<span class="text-error">पहले कोई option चुनिए।</span>';
    return;
  }

  const r=await sb.rpc('submit_target_verification_option',{
    p_verification_question_id:vId,
    p_target_id:targetId,
    p_selected_option:Number(val)
  });

  if(r.error){
    if(res)res.innerHTML='<span class="text-error">'+esc(r.error.message)+'</span>';
    return;
  }

  if(r.data===true){
    if(res)res.innerHTML='<span class="text-success">✅ Correct Answer — Verification Successful</span>';
    const btn=res.closest('.material-vq-card')?.querySelector('button.btn-green');
    if(btn)btn.disabled=true;

    // Refresh context. If PDF access is now unlocked, clearly offer direct open.
    if(materialVerificationContext?.material?.id){
      const can=await sb.rpc('can_read_material',{p_material_id:materialVerificationContext.material.id});
      if(can.data===true){
        const modal=document.querySelector('.material-verification-modal');
        if(modal){
          const done=document.createElement('div');
          done.className='verification-unlocked-banner';
          done.innerHTML=`<b>🎉 Verification Complete — PDF अब खुल सकती है।</b>
            <button class="btn btn-blue" onclick="closeMaterialVerification();readPdf(${JSON.stringify(materialVerificationContext.material.id)},${JSON.stringify(materialVerificationContext.material.storage_path||"")},${JSON.stringify(materialVerificationContext.material.title||"PDF")})">Read PDF Now</button>`;
          modal.prepend(done);
        }
      }
    }
  }else{
    if(res)res.innerHTML='<span class="text-error">❌ Answer Wrong — दोबारा सही उत्तर दीजिए।</span>';
  }
}

async function openVerificationForMaterial(materialId){
  try{
    const ctx=await getMaterialVerificationContext(materialId);
    materialVerificationContext=ctx;

    if(!ctx.material){
      showActionNotice('PDF की जानकारी नहीं मिली।','',null,'error');
      return;
    }

    if(!ctx.questions.length){
      showActionNotice(
        'इस PDF के लिए कोई Class Verification Question सेट नहीं है। इसलिए PDF सीधे खोली जा सकती है।',
        'Read PDF',
        ()=>readPdf(ctx.material.id,ctx.material.storage_path,ctx.material.title),
        'success'
      );
      return;
    }

    showMaterialVerificationPanel(ctx);
  }catch(e){
    showActionNotice('Verification खोलने में समस्या आई: '+(e.message||'Unknown error'),'',null,'error');
  }
}

/* Final read override: exact PDF-day verification button */
const __pdfVerificationReadPdf=readPdf;
readPdf=async function(id,path,title){
  // For legacy PDFs, first check whether this PDF day actually has any verification questions.
  if(!isR2PdfPath(path)){
    try{
      const ctx=await getMaterialVerificationContext(id);
      if(ctx.questions.length===0){
        const legacy=await sb.storage.from('study-pdfs').createSignedUrl(path,120);
        if(legacy.error){showActionNotice('PDF खोलने में समस्या आई: '+legacy.error.message,'',null,'error');return}
        window.open(legacy.data.signedUrl,'_blank','noopener');
        return;
      }
    }catch(_){}

    const ok=await sb.rpc('can_read_material',{p_material_id:id});
    if(ok.error){showActionNotice('PDF खोलने में समस्या आई: '+ok.error.message,'',null,'error');return}

    if(!ok.data){
      showActionNotice(
        'पहले Class Verification पूरा करें, तभी यह PDF खुलेगी।',
        'Verification यहाँ से करें',
        ()=>openVerificationForMaterial(id),
        'warning'
      );
      return;
    }

    const legacy=await sb.storage.from('study-pdfs').createSignedUrl(path,120);
    if(legacy.error){showActionNotice('PDF खोलने में समस्या आई: '+legacy.error.message,'',null,'error');return}
    window.open(legacy.data.signedUrl,'_blank','noopener');
    return;
  }

  // R2 PDF. Updated SQL makes no-question PDFs directly readable.
  try{
    const res=await r2ApiFetch(`/material/${encodeURIComponent(id)}/read`);
    if(!res.ok){
      let data={};
      try{data=await res.json()}catch(_){}

      if(data.code==='VERIFICATION_REQUIRED'||res.status===403){
        showActionNotice(
          data.error||'पहले Class Verification पूरा करें, तभी PDF खुलेगी।',
          'Verification यहाँ से करें',
          ()=>openVerificationForMaterial(id),
          'warning'
        );
        return;
      }
      throw new Error(data.error||'PDF नहीं खुल पाई।');
    }
    await openR2PdfResponse(res,title,false);
  }catch(e){
    showActionNotice('PDF खोलने में समस्या आई: '+(e.message||'Unknown error'),'',null,'error');
  }
};

init();
