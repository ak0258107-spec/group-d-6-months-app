
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
const STUDENT_ONBOARDING_KEY_PREFIX='gk_groupd_student_onboarding_v10_';
function studentOnboardingComplete(userId){return !!userId&&localStorage.getItem(STUDENT_ONBOARDING_KEY_PREFIX+String(userId))==='1'}
const SUBJECT_CLASS={"Maths":"subject-maths","Mathematics":"subject-maths","Reasoning":"subject-reasoning","Haryana GK":"subject-haryana","Hindi":"subject-hindi","Science":"subject-science","Polity":"subject-polity","History":"subject-history","Geography":"subject-geography","Static GK":"subject-static","Computer":"subject-computer","BNS/BNSS/BSA":"subject-law"};
function tab(name,el){["home","targets","tests","oneliners","pdfs","notifications","profile"].forEach(x=>document.getElementById(x+"Tab").classList.toggle("hidden",x!==name));document.querySelectorAll(".bottom-nav button").forEach(b=>b.classList.remove("active"));if(el)el.classList.add("active")}
function sclass(s){return SUBJECT_CLASS[s]||"subject-other"}
async function init(){registerSW();user=await requireAuth();if(!user)return;profile=await getProfile(user.id);if(String(profile?.role||'').toLowerCase()==='admin'){location.replace('q9v3x7k2-r8m4p6t1-z5n7c2w9.html');return}if(!studentOnboardingComplete(user.id)){location.replace('index.html?onboarding=1');return}await loadCurrentDay();await Promise.all([renderHome(),renderTargets(),loadTests(),loadOneLiners(),loadPdfs(),loadNotifications(),renderProfile()])}
async function loadCurrentDay(){const today=new Date().toISOString().slice(0,10);let r=await sb.from("schedule_days").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).eq("manual_lock",false).or(`manual_unlock.eq.true,and(manual_unlock.eq.false,day_date.lte.${today})`).order("day_number",{ascending:false}).limit(1).maybeSingle();currentDay=r.data;if(!currentDay)return;const [tr,tc,vr,mr,te]=await Promise.all([sb.from("daily_targets").select("*").eq("schedule_day_id",currentDay.id).eq("status","published").order("target_order"),sb.from("target_completions").select("*").eq("user_id",user.id),sb.from("verification_questions").select("*").eq("schedule_day_id",currentDay.id).eq("is_active",true).order("created_at"),sb.from("study_materials").select("*").eq("schedule_day_id",currentDay.id).eq("status","published").order("created_at"),sb.from("tests").select("*").eq("schedule_day_id",currentDay.id).eq("status","published").order("created_at")]);currentTargets=tr.data||[];(tc.data||[]).forEach(x=>targetCompletionMap.set(x.target_id,x));verificationRows=vr.data||[];materials=mr.data||[];tests=te.data||[]}
function finalTest(){return tests.filter(t=>t.is_final_daily).slice(-1)[0]||null}
async function bestAttempt(testId){if(!testId)return null;const r=await sb.from("test_attempts").select("*").eq("user_id",user.id).eq("test_id",testId).eq("status","submitted").order("percentage",{ascending:false}).limit(1);return r.data?.[0]||null}
async function renderHome(){if(!currentDay){homeBox.innerHTML='<div class="card">आज का Target उपलब्ध नहीं है।</div>';return}const ft=finalTest(),fa=await bestAttempt(ft?.id),done=currentTargets.filter(t=>targetCompletionMap.has(t.id)).length,total=currentTargets.length,passed=!ft||(fa&&fa.percentage>=ft.passing_percent);const status=done===0?'Work Complete नहीं हुआ है ❌':done<total?'आज का Target पूरा करें ⚠️':!passed?'Final Test Pass करना बाकी है 📝':'आज का Target Complete 🎉';homeBox.innerHTML=`<div class="hello">Hello, ${esc(profile?.full_name||'Student')} 👋</div><div class="muted">Day ${currentDay.day_number} • ${fmtDate(currentDay.day_date)}</div><div class="status-hero hero-premium"><div class="small">आज का संदेश</div><h2>${status}</h2><p>Class → Verification → PDF → Final Mock Test → Target Complete</p></div><div class="workflow-steps"><div class="workflow-step ${done?'done':''}"><div class="workflow-icon">▶️</div><div class="workflow-title">Class</div></div><div class="workflow-step ${done?'done':''}"><div class="workflow-icon">✅</div><div class="workflow-title">Verification</div></div><div class="workflow-step ${materials.length?'done':''}"><div class="workflow-icon">📄</div><div class="workflow-title">PDF</div></div><div class="workflow-step ${passed&&done===total?'done':''}"><div class="workflow-icon">📝</div><div class="workflow-title">Final Test</div></div></div><div class="stat-row" style="margin-top:12px"><div class="stat-mini"><div class="muted">Targets</div><div class="kpi">${done}/${total}</div></div><div class="stat-mini"><div class="muted">Streak</div><div class="kpi">${profile?.current_streak||0}</div></div></div>`}
function targetVerifications(targetId){return verificationRows.filter(v=>String(v.target_id)===String(targetId))}
async function renderTargets(){if(!currentDay){targetsBox.innerHTML='<div class="card">No target.</div>';return}let html=`<div class="row wrap"><div><h3>Day ${currentDay.day_number}</h3><div class="muted">${fmtDate(currentDay.day_date)}</div></div></div>`;for(const t of currentTargets){const done=targetCompletionMap.has(t.id),vs=targetVerifications(t.id);html+=`<div class="target-card ${sclass(t.subject)}"><div class="small">${esc(t.subject)}</div><div class="topic">${esc(t.topic)}</div>${t.youtube_url?`<p><a class="btn btn-red" target="_blank" href="${esc(t.youtube_url)}">▶ Watch YouTube Class</a></p>`:'<p class="small">Class link अभी add नहीं किया गया।</p>'}<div>${done?'<span class="badge badge-green">Verified & Completed ✓</span>':'<span class="badge badge-orange">Verification Pending</span>'}</div></div>`;if(!done&&vs.length){for(const v of vs){const opts=Array.isArray(v.options)?v.options:[];html+=`<div class="verify-card"><h4>Class Verification</h4>${v.show_question?`<p><b>${esc(v.question_text)}</b></p>`:'<p class="muted"><b>Question class में पूछा गया था। सही option चुनिए।</b></p>'}<div class="choice-grid" id="choices_${v.id}">${opts.map((o,i)=>`<button class="choice-option" onclick="selectVerifyOption('${v.id}',${i},this)">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div><input type="hidden" id="vq_${v.id}"><div style="height:8px"></div><button class="btn btn-green" onclick="verifyTarget('${v.id}','${t.id}')">Submit Answer</button><div id="vres_${v.id}" class="small" style="margin-top:8px"></div></div>`}}}const ft=finalTest();if(ft)html+=`<div class="card final-test-card"><div class="row wrap"><div><b>Daily Final Mock Test</b><div class="muted">Pass: ${ft.passing_percent}% • ${ft.total_questions} Questions</div></div><a class="btn btn-purple btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${ft.id}">Start Final Test</a></div></div>`;targetsBox.innerHTML=html}
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
async function loadTests(){const r=await sb.from('tests').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).eq('status','published').order('created_at',{ascending:false});testsList.innerHTML=(r.data||[]).map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title)}</b><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent||0}%${t.is_final_daily?' • Final Daily Test':''}</div></div><a class="btn btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${t.id}">Start Test</a></div></div>`).join('')||'<div class="card">अभी कोई Test नहीं है।</div>'}
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
function profileAvatarSvg(type='boy'){
  if(type==='girl')return `<svg class="profile-avatar-svg" viewBox="0 0 160 160" role="img" aria-label="Girl avatar"><defs><linearGradient id="girlBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff2f7"/><stop offset="1" stop-color="#e8f3ff"/></linearGradient><linearGradient id="girlDress" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#a88aec"/><stop offset="1" stop-color="#6c7de8"/></linearGradient></defs><circle cx="80" cy="80" r="76" fill="url(#girlBg)"/><circle cx="80" cy="63" r="36" fill="#3c2b3f"/><path d="M48 64c0-30 15-46 33-46 22 0 37 18 35 49-8-8-16-13-25-15-11 9-25 13-43 12Z" fill="#352438"/><ellipse cx="80" cy="68" rx="29" ry="32" fill="#ffd8bd"/><path d="M56 62c16-1 29-6 39-16 6 4 12 9 18 17-3-25-16-39-34-39-17 0-29 13-31 38Z" fill="#3c2b3f"/><circle cx="69" cy="70" r="3.2" fill="#263749"/><circle cx="92" cy="70" r="3.2" fill="#263749"/><path d="M71 83c6 5 13 5 19 0" fill="none" stroke="#c66f78" stroke-width="3" stroke-linecap="round"/><path d="M45 151c4-34 18-51 35-51 19 0 33 17 37 51Z" fill="url(#girlDress)"/><path d="M64 103c4 8 10 12 16 12s12-4 16-12" fill="#ffd8bd"/><circle cx="117" cy="38" r="11" fill="#fff" opacity=".9"/><path d="M112 38h10M117 33v10" stroke="#ef6fa1" stroke-width="3" stroke-linecap="round"/></svg>`;
  return `<svg class="profile-avatar-svg" viewBox="0 0 160 160" role="img" aria-label="Boy avatar"><defs><linearGradient id="boyBg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#eaf7ff"/><stop offset="1" stop-color="#effff3"/></linearGradient><linearGradient id="boyShirt" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4e97e8"/><stop offset="1" stop-color="#3269bd"/></linearGradient></defs><circle cx="80" cy="80" r="76" fill="url(#boyBg)"/><path d="M44 151c4-34 18-51 36-51 19 0 33 17 37 51Z" fill="url(#boyShirt)"/><ellipse cx="80" cy="67" rx="30" ry="33" fill="#ffd5b5"/><path d="M48 62c0-28 14-43 33-43 18 0 31 12 34 35-10-7-22-11-35-11-9 9-20 15-32 19Z" fill="#283a4b"/><path d="M54 48c7-19 19-29 36-28 12 1 20 7 25 18-18-6-39-3-61 10Z" fill="#30485d"/><circle cx="69" cy="70" r="3.2" fill="#263749"/><circle cx="92" cy="70" r="3.2" fill="#263749"/><path d="M71 83c6 5 13 5 19 0" fill="none" stroke="#b66d63" stroke-width="3" stroke-linecap="round"/><path d="M65 103c3 8 9 12 15 12s12-4 15-12" fill="#ffd5b5"/><path d="M70 116l10 9 10-9" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="119" cy="38" r="11" fill="#fff" opacity=".9"/><path d="M114 38h10M119 33v10" stroke="#3e94df" stroke-width="3" stroke-linecap="round"/></svg>`;
}
function profileMaskPhone(value=''){
  const digits=String(value||'').replace(/\D/g,'');
  if(digits.length<6)return value||'Not added';
  return `${digits.slice(0,2)}******${digits.slice(-2)}`;
}
function profileMaskEmail(value=''){
  const email=String(value||'').trim();
  if(!email||email.endsWith('@groupd90.local'))return 'Mobile Login Account';
  const parts=email.split('@');if(parts.length!==2)return email;
  const left=parts[0];return `${left.slice(0,Math.min(3,left.length))}****@${parts[1]}`;
}
function profilePercent(value){const n=Number(value);return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0}
function selectedProfileAvatar(){
  const fromProfile=String(profile?.avatar_type||'').toLowerCase();
  const fromLocal=localStorage.getItem('gk_profile_avatar_'+String(user?.id||''));
  return ['boy','girl'].includes(fromProfile)?fromProfile:(['boy','girl'].includes(fromLocal)?fromLocal:'boy');
}
async function selectProfileAvatar(type){
  if(!['boy','girl'].includes(type)||!user)return;
  localStorage.setItem('gk_profile_avatar_'+user.id,type);
  profile={...(profile||{}),avatar_type:type};
  const host=document.getElementById('profileMainAvatar');if(host)host.innerHTML=profileAvatarSvg(type);
  document.querySelectorAll('.profile-avatar-choice').forEach(btn=>btn.classList.toggle('active',btn.dataset.avatar===type));
  const result=await sb.rpc('set_my_avatar_type',{p_avatar_type:type});
  if(result.error){toast('Avatar इस device पर save है। Supabase में Profile Avatar SQL चलाने के बाद सभी devices पर save होगा।','info');return}
  toast(type==='girl'?'Girl Avatar save हो गया।':'Boy Avatar save हो गया।','success');
}
async function loadPremiumProfileStats(){
  const stats={completedClasses:0,pdfVerified:0,mockAttempts:0,averageScore:0,completedDays:Number(profile?.total_completed_days||0),streak:Number(profile?.current_streak||0),todayTargets:currentTargets.length,todayDone:currentTargets.filter(t=>targetCompletionMap.has(t.id)).length,todayPdfs:materials.length,todayPdfsReady:0,finalStatus:'Not Added',targetStatus:currentDay?'In Progress':'No Target',level:0,weekCompleted:0,subjects:[]};
  try{
    const [targetR,progressR,attemptR,pdfR]=await Promise.all([
      sb.from('target_completions').select('target_id').eq('user_id',user.id).limit(5000),
      sb.from('daily_progress').select('schedule_day_id,status,test_score_percent,updated_at').eq('user_id',user.id).order('updated_at',{ascending:false}).limit(365),
      sb.from('test_attempts').select('id,test_id,percentage,status').eq('user_id',user.id).eq('status','submitted').limit(300),
      sb.from('pdf_verification_attempts').select('material_id,is_correct').eq('user_id',user.id).eq('is_correct',true).limit(5000)
    ]);
    if(!targetR.error)stats.completedClasses=(targetR.data||[]).length;
    const progressRows=progressR.error?[]:(progressR.data||[]);
    const completedRows=progressRows.filter(x=>x.status==='completed');
    stats.completedDays=Math.max(stats.completedDays,completedRows.length);
    const weekAgo=Date.now()-7*24*60*60*1000;
    stats.weekCompleted=completedRows.filter(x=>new Date(x.updated_at||0).getTime()>=weekAgo).length;
    const attempts=attemptR.error?[]:(attemptR.data||[]);
    stats.mockAttempts=attempts.length;
    const validScores=attempts.map(x=>Number(x.percentage)).filter(Number.isFinite);
    stats.averageScore=validScores.length?Math.round(validScores.reduce((a,b)=>a+b,0)/validScores.length):Number(profile?.average_test_percentage||0);
    if(!pdfR.error)stats.pdfVerified=new Set((pdfR.data||[]).map(x=>String(x.material_id))).size;
    if(materials.length){
      const access=await Promise.all(materials.map(async m=>{const r=await sb.rpc('can_read_material',{p_material_id:m.id});return !r.error&&r.data===true}));
      stats.todayPdfsReady=access.filter(Boolean).length;
    }
    const ft=finalTest();
    if(ft){
      const best=attempts.filter(x=>String(x.test_id)===String(ft.id)).map(x=>Number(x.percentage)).filter(Number.isFinite).sort((a,b)=>b-a)[0];
      stats.finalStatus=best===undefined?'Pending':best>=Number(ft.passing_percent||0)?'Passed':'Retry';
    }
    const targetsReady=stats.todayTargets===0||stats.todayDone>=stats.todayTargets;
    const pdfsReady=stats.todayPdfs===0||stats.todayPdfsReady>=stats.todayPdfs;
    const finalReady=stats.finalStatus==='Not Added'||stats.finalStatus==='Passed';
    if(currentDay&&targetsReady&&pdfsReady&&finalReady)stats.targetStatus='Completed';
    const completionRate=progressRows.length?completedRows.length/progressRows.length*100:0;
    stats.level=profilePercent(completionRate*.4+profilePercent(stats.averageScore)*.35+Math.min(stats.streak,7)/7*100*.25);
    const attemptIds=attempts.slice(0,40).map(x=>x.id).filter(Boolean);
    if(attemptIds.length){
      const ar=await sb.from('test_answers').select('is_correct,test_questions(subject)').in('attempt_id',attemptIds).limit(5000);
      if(!ar.error){
        const map=new Map();
        for(const row of ar.data||[]){
          const relation=Array.isArray(row.test_questions)?row.test_questions[0]:row.test_questions;
          const subject=String(relation?.subject||'').trim();if(!subject)continue;
          const item=map.get(subject)||{subject,total:0,correct:0};item.total+=1;if(row.is_correct===true)item.correct+=1;map.set(subject,item);
        }
        stats.subjects=[...map.values()].map(x=>({...x,percent:profilePercent(x.correct*100/Math.max(1,x.total))})).sort((a,b)=>b.total-a.total).slice(0,6);
      }
    }
  }catch(e){console.warn('Profile stats:',e)}
  return stats;
}
function profileAchievement(label,icon,unlocked,help){return `<div class="profile-achievement ${unlocked?'unlocked':'locked'}"><span>${icon}</span><div><b>${esc(label)}</b><small>${esc(unlocked?'Unlocked':help)}</small></div></div>`}
function toggleProfileRules(){document.getElementById('profileRulesPanel')?.classList.toggle('hidden')}
async function sendProfilePasswordReset(){
  const email=String(user?.email||'');
  if(!email||email.endsWith('@groupd90.local')){toast('Mobile Login account के Password के लिए Admin से संपर्क करें।','info');return}
  const base=location.href.split('/').slice(0,-1).join('/');
  const r=await sb.auth.resetPasswordForEmail(email,{redirectTo:base+'/s4n8v2k7-r1p6x9m3-c5t8q4z2.html'});
  if(r.error){toast(r.error.message,'error');return}toast('Password Reset Link Email पर भेज दिया गया है।','success');
}
async function renderProfile(){
  const box=document.getElementById('profileBox');if(!box)return;
  box.innerHTML='<div class="profile-loading card"><div class="profile-loader"></div><b>Profile तैयार हो रही है…</b></div>';
  const stats=await loadPremiumProfileStats();
  const avatar=selectedProfileAvatar();
  const name=profile?.full_name||user?.user_metadata?.full_name||'Student';
  const studentId='GKD-'+String(user?.id||'00000000').replace(/-/g,'').slice(0,8).toUpperCase();
  const todayClassText=`${stats.todayDone}/${stats.todayTargets}`;
  const todayPdfText=`${stats.todayPdfsReady}/${stats.todayPdfs}`;
  const statusClass=stats.targetStatus==='Completed'?'complete':'progress';
  const subjectHtml=stats.subjects.length?stats.subjects.map(s=>`<div class="profile-subject-row"><div class="profile-subject-head"><b>${esc(s.subject)}</b><span>${s.percent}%</span></div><div class="profile-progress-track"><i style="width:${s.percent}%"></i></div></div>`).join(''):'<div class="profile-empty-state">Subject-wise performance आपके Tests attempt करने के बाद यहाँ दिखाई देगी।</div>';
  box.innerHTML=`<div class="profile-premium-shell">
    <section class="profile-id-card">
      <div class="profile-id-watermark">GK</div>
      <div class="profile-id-brand"><span>GK</span><div><b>GK BY PURUSHOTAM SIR</b><small>GROUP-D TARGET BATCH</small></div></div>
      <div class="profile-id-main"><div id="profileMainAvatar" class="profile-main-avatar">${profileAvatarSvg(avatar)}</div><div class="profile-id-copy"><div class="profile-welcome">STUDENT PROFILE</div><h2>${esc(name)}</h2><p>${esc(studentId)}</p><div class="profile-badges"><span>● Account Active</span><span>✓ Batch Member</span></div></div></div>
      <div class="profile-slogan">अबकी बार, आखिरी बार — जीत फिक्स!</div>
    </section>

    <section class="profile-panel profile-avatar-panel"><div class="profile-panel-title"><div><span>01</span><b>अपना Avatar चुनें</b></div><small>केवल Boy या Girl Avatar</small></div><div class="profile-avatar-options"><button type="button" data-avatar="boy" class="profile-avatar-choice ${avatar==='boy'?'active':''}" onclick="selectProfileAvatar('boy')">${profileAvatarSvg('boy')}<b>Boy Avatar</b><i>✓</i></button><button type="button" data-avatar="girl" class="profile-avatar-choice ${avatar==='girl'?'active':''}" onclick="selectProfileAvatar('girl')">${profileAvatarSvg('girl')}<b>Girl Avatar</b><i>✓</i></button></div></section>

    <section class="profile-panel"><div class="profile-panel-title"><div><span>02</span><b>आज की स्थिति</b></div><em class="profile-target-status ${statusClass}">${esc(stats.targetStatus)}</em></div><div class="profile-today-grid"><div><span>▶</span><b>${todayClassText}</b><small>Classes</small></div><div><span>▤</span><b>${todayPdfText}</b><small>PDF Verified</small></div><div><span>✎</span><b>${esc(stats.finalStatus)}</b><small>Final Test</small></div><div><span>✓</span><b>${esc(stats.targetStatus)}</b><small>Target</small></div></div></section>

    <section class="profile-stat-grid"><div class="profile-stat-card blue"><span>▶</span><b>${stats.completedClasses}</b><small>Classes Completed</small></div><div class="profile-stat-card green"><span>▤</span><b>${stats.pdfVerified}</b><small>PDFs Verified</small></div><div class="profile-stat-card purple"><span>✎</span><b>${stats.mockAttempts}</b><small>Mock Tests</small></div><div class="profile-stat-card orange"><span>★</span><b>${profilePercent(stats.averageScore)}%</b><small>Average Score</small></div></section>

    <section class="profile-panel profile-preparation-panel"><div class="profile-panel-title"><div><span>03</span><b>Preparation Progress</b></div><small>आपकी अपनी progress</small></div><div class="profile-progress-layout"><div class="profile-level-ring" style="--level:${stats.level*3.6}deg"><div><b>${stats.level}%</b><small>Preparation<br>Level</small></div></div><div class="profile-progress-details"><div><span>Completed Days</span><b>${stats.completedDays}</b></div><div><span>This Week</span><b>${stats.weekCompleted}/7</b></div><div><span>Current Streak</span><b>${stats.streak} Days</b></div><div class="profile-progress-track"><i style="width:${stats.level}%"></i></div></div></div></section>

    <section class="profile-panel"><div class="profile-panel-title"><div><span>04</span><b>Subject Performance</b></div><small>App Tests के आधार पर</small></div><div class="profile-subject-list">${subjectHtml}</div></section>

    <section class="profile-panel"><div class="profile-panel-title"><div><span>05</span><b>Achievements</b></div><small>Consistency और मेहनत</small></div><div class="profile-achievement-grid">${profileAchievement('First Mock Test','🏁',stats.mockAttempts>=1,'पहला Test दें')}${profileAchievement('10 PDFs Completed','📚',stats.pdfVerified>=10,`${stats.pdfVerified}/10 PDFs`)}${profileAchievement('7-Day Warrior','🔥',stats.streak>=7,`${stats.streak}/7 Days`)}${profileAchievement('Target Champion','🏆',stats.completedDays>=1,'एक Target पूरा करें')}${profileAchievement('High Scorer','⭐',stats.averageScore>=80,`${profilePercent(stats.averageScore)}/80%`)}</div></section>

    <section class="profile-panel"><div class="profile-panel-title"><div><span>06</span><b>Account Details</b></div><small>आपकी सुरक्षित जानकारी</small></div><div class="profile-account-list"><div><span>Full Name</span><b>${esc(name)}</b></div><div><span>Email</span><b>${esc(profileMaskEmail(user?.email||''))}</b></div><div><span>Mobile</span><b>${esc(profileMaskPhone(profile?.phone||''))}</b></div><div><span>Registration</span><b>${user?.created_at?new Date(user.created_at).toLocaleDateString('hi-IN',{day:'2-digit',month:'short',year:'numeric'}):'—'}</b></div></div></section>

    <section class="profile-panel profile-actions-panel"><div class="profile-panel-title"><div><span>07</span><b>Quick Actions</b></div></div><div class="profile-actions"><button class="profile-action" onclick="sendProfilePasswordReset()"><span>🔐</span><b>Password Reset</b></button><button class="profile-action" onclick="toggleProfileRules()"><span>📜</span><b>App Rules</b></button><a class="profile-action" href="https://t.me/gkbypurushotamsir" target="_blank" rel="noopener"><span>💬</span><b>Help & Support</b></a><button class="profile-action danger" onclick="logout()"><span>↪</span><b>Logout</b></button></div><div id="profileRulesPanel" class="profile-rules hidden"><b>App Rules</b><p>अपना Login, Password, PDF link या protected content किसी अन्य व्यक्ति के साथ share न करें। Daily Target ईमानदारी से पूरा करें और Tests स्वयं attempt करें।</p></div></section>
  </div>`;
}
let notificationRows=[];
let notificationPollingStarted=false;
function relatedNotificationTab(type=''){
  return ({pdf:'pdfs',test:'tests',mock:'tests',question:'tests',cbt:'tests',oneliner:'oneliners',target:'targets',class:'targets',broadcast:'notifications'})[String(type).toLowerCase()]||'notifications';
}
async function loadNotifications(){
  const [br,ar,broadcastReads,appReads]=await Promise.all([
    sb.from('broadcast_messages').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(50),
    sb.from('app_notifications').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(50),
    sb.from('student_notification_reads').select('broadcast_id').eq('student_id',user.id),
    sb.from('student_app_notification_reads').select('notification_id').eq('student_id',user.id)
  ]);
  const broadcastReadSet=new Set((broadcastReads.data||[]).map(x=>String(x.broadcast_id)));
  const appReadSet=new Set((appReads.data||[]).map(x=>String(x.notification_id)));
  const broadcasts=(br.data||[]).map(x=>({id:'b_'+x.id,rawId:x.id,title:x.title,message:x.message,type:x.message_type||'info',relatedType:'broadcast',created_at:x.created_at,unread:!broadcastReadSet.has(String(x.id)),isBroadcast:true}));
  const auto=(ar.data||[]).filter(x=>x.related_type!=='broadcast').map(x=>({id:'a_'+x.id,rawId:x.id,title:x.title,message:x.message,type:x.notification_type||'info',relatedType:x.related_type||'',relatedId:x.related_id||'',created_at:x.created_at,unread:!appReadSet.has(String(x.id)),isBroadcast:false}));
  notificationRows=[...broadcasts,...auto].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const unread=notificationRows.filter(x=>x.unread).length,b=document.getElementById('notificationBadge');
  if(b){b.textContent=unread;b.classList.toggle('hidden',!unread)}
  renderNotifications();
}
function renderNotifications(){
  notificationsList.innerHTML=notificationRows.map(x=>`<div class="item notice-premium ${esc(x.type)} ${x.unread?'notification-unread':''}" onclick="openRelatedNotification('${esc(x.relatedType||'')}')"><div class="row"><b>${esc(x.title)}</b>${x.unread?'<span class="badge badge-red">NEW</span>':''}</div><p>${esc(x.message)}</p><div class="small muted">${new Date(x.created_at).toLocaleString('en-IN')}</div></div>`).join('')||'<div class="card">अभी कोई Notification नहीं है।</div>';
}
function openRelatedNotification(type){const target=relatedNotificationTab(type);if(target!=='notifications')tab(target,null)}
async function openNotifications(){
  if(typeof Notification!=='undefined'&&Notification.permission==='default')await enablePushNotifications();
  tab('notifications');
  await markAllNotificationsRead();
}
async function markAllNotificationsRead(){
  const broadcastRows=notificationRows.filter(x=>x.unread&&x.isBroadcast).map(x=>({student_id:user.id,broadcast_id:x.rawId}));
  const appRows=notificationRows.filter(x=>x.unread&&!x.isBroadcast).map(x=>({student_id:user.id,notification_id:x.rawId}));
  if(broadcastRows.length)await sb.from('student_notification_reads').upsert(broadcastRows,{onConflict:'student_id,broadcast_id'});
  if(appRows.length)await sb.from('student_app_notification_reads').upsert(appRows,{onConflict:'student_id,notification_id'});
  await loadNotifications();
}
function startNotificationPolling(){
  if(notificationPollingStarted)return;notificationPollingStarted=true;
  setInterval(()=>{if(document.visibilityState==='visible'&&user?.id)loadNotifications().catch(()=>{})},30000);
  window.addEventListener('focus',()=>{if(user?.id)loadNotifications().catch(()=>{})});
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='PUSH_NOTIFICATION_RECEIVED')loadNotifications().catch(()=>{})});
}

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
  if(ft)html+=`<div class="card final-test-card"><div class="row wrap"><div><b>Daily Final Mock Test</b><div class="muted">Pass: ${ft.passing_percent}% • ${ft.total_questions} Questions</div></div><a class="btn btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${ft.id}">Start Final Test</a></div></div>`;
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
    setTimeout(()=>location.href=`m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`,900);
    return;
  }
  toast('PDF Download अभी Locked है।','error');
}

const __oldStudentInit=init;
init=async function(){
  await registerSW();
  await initInstallUI('studentInstallBtn');
  user=await requireAuth();if(!user)return;
  profile=await getProfile(user.id);
  if(String(profile?.role||'').toLowerCase()==='admin'){location.replace('q9v3x7k2-r8m4p6t1-z5n7c2w9.html');return}
  if(!studentOnboardingComplete(user.id)){location.replace('index.html?onboarding=1');return}
  await initPushNotifications();
  startNotificationPolling();
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
      setTimeout(()=>location.href=`m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`,900);
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
        ()=>{location.href=`m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`},
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



/* ===== HOME POSTER / BANNER SLIDER ===== */
let homePosterUrls=[],homePosterIndex=0,homePosterTimer=null,homePosterRows=[];
function clearHomePosterUrls(){homePosterUrls.forEach(u=>URL.revokeObjectURL(u));homePosterUrls=[]}

async function loadHomePosters(){
  const section=document.getElementById('homePosterSection');
  const slider=document.getElementById('homePosterSlider');
  const dots=document.getElementById('homePosterDots');
  if(!section||!slider||!dots)return;

  clearHomePosterUrls();
  if(homePosterTimer)clearInterval(homePosterTimer);

  const r=await sb.from('app_posters').select('*').eq('is_active',true).order('sort_order').order('created_at',{ascending:false});
  if(r.error){section.style.display='none';return}

  const rows=(r.data||[]).filter(p=>(!p.start_at||new Date(p.start_at)<=new Date())&&(!p.end_at||new Date(p.end_at)>=new Date()));
  if(!rows.length){section.style.display='none';slider.innerHTML='';dots.innerHTML='';return}

  homePosterRows=[];
  for(const p of rows){
    try{
      const res=await r2ApiFetch(`/poster?key=${encodeURIComponent(p.image_key)}`);
      if(!res.ok)continue;
      const blob=await res.blob();
      const url=URL.createObjectURL(blob);
      homePosterUrls.push(url);
      homePosterRows.push({...p,_url:url});
    }catch(_){}
  }

  if(!homePosterRows.length){section.style.display='none';return}
  section.style.display='block';
  slider.innerHTML=homePosterRows.map((p,i)=>`<button class="home-poster-slide ${i===0?'active':''}" onclick='openPosterLink(${i})'><img src="${p._url}" alt="${esc(p.title||'Poster')}"></button>`).join('');
  dots.innerHTML=homePosterRows.map((_,i)=>`<button class="${i===0?'active':''}" onclick="showPosterSlide(${i})"></button>`).join('');
  homePosterIndex=0;
  if(homePosterRows.length>1)homePosterTimer=setInterval(()=>showPosterSlide((homePosterIndex+1)%homePosterRows.length),5000);
}

function showPosterSlide(index){
  const slides=[...document.querySelectorAll('.home-poster-slide')];
  const dotButtons=[...document.querySelectorAll('#homePosterDots button')];
  if(!slides.length)return;
  homePosterIndex=(index+slides.length)%slides.length;
  slides.forEach((x,i)=>x.classList.toggle('active',i===homePosterIndex));
  dotButtons.forEach((x,i)=>x.classList.toggle('active',i===homePosterIndex));
}

function openPosterLink(index){
  const p=homePosterRows[index];
  if(!p?.click_url)return;
  const url=String(p.click_url);
  if(url.startsWith('http://')||url.startsWith('https://'))window.open(url,'_blank','noopener');
  else location.href=url;
}

const __baseStudentInitForPoster=init;
init=async function(){
  await __baseStudentInitForPoster();
  await loadHomePosters();
};



/* ==================================================================
   FINAL PRODUCT FLOW — Class has no verification.
   Verification is only before PDF view; download uses a gate test.
   ================================================================== */
function currentDayMaterials(){
  if(!currentDay)return [];
  return (materials||[]).filter(m=>String(m.schedule_day_id)===String(currentDay.id));
}

async function pdfVerificationReady(material){
  if(!material)return false;
  const r=await sb.rpc('can_read_material',{p_material_id:material.id});
  return !r.error&&r.data===true;
}

statusModel=async function(){
  if(!currentDay)return {key:'notstarted',title:'आज का Target अभी उपलब्ध नहीं है',msg:'निर्धारित तारीख या Admin unlock के बाद content उपलब्ध होगा।'};
  if(!currentTargets.length)return {key:'notstarted',title:'आज का Target publish नहीं हुआ है',msg:'Admin द्वारा आज का content publish होने का इंतजार करें।'};
  const mats=currentDayMaterials();
  if(!mats.length)return {key:'pending',title:'आज की Classes उपलब्ध हैं ▶',msg:'Classes देखें। PDF publish होने के बाद verification और final submission पूरा करें।'};
  const access=await Promise.all(mats.map(pdfVerificationReady));
  const allPdfReady=access.every(Boolean);
  if(!allPdfReady)return {key:'pending',title:'PDF Verification बाकी है 📄',msg:'PDF खोलें, verification questions का निर्धारित प्रतिशत clear करें और notes पढ़ें।'};
  const ft=finalTest(),fa=ft?await bestAttempt(ft.id):null;
  const finalPassed=!ft||!!fa&&Number(fa.percentage||0)>=Number(ft.passing_percent||0);
  if(ft&&!finalPassed)return {key:'pending',title:'Final Submit बाकी है 📝',msg:`Final Test submit करें${Number(ft.passing_percent||0)>0?` और कम से कम ${ft.passing_percent}% score करें`:''}।`};
  return {key:'excellent',title:'आज का Target Complete 🎉',msg:'बहुत बढ़िया! Class, PDF verification और final submission पूरा हो गया।'};
};

renderTargets=async function(){
  if(!currentDay){targetsBox.innerHTML=fiveDayPreviewHtml()||'<div class="card">अभी Target उपलब्ध नहीं है।</div>';return}
  let html=fiveDayPreviewHtml()+`<div class="premium-section-head"><div><span class="section-kicker">TODAY'S TARGET</span><h2>Day ${currentDay.day_number} की Classes</h2><div class="muted">${fmtDate(currentDay.day_date)} • Class पर कोई verification नहीं है।</div></div></div>`;
  for(const t of currentTargets){
    html+=`<div class="target-card ${sclass(t.subject)}"><div class="row wrap" style="justify-content:space-between"><div><div class="small">${esc(t.subject)}</div><div class="topic">${esc(t.topic)}</div></div><span class="badge badge-blue">Class Target</span></div>${t.youtube_url?`<p><a class="btn btn-red premium-action-btn" target="_blank" rel="noopener" href="${esc(t.youtube_url)}">▶ YouTube Class खोलें</a></p>`:'<p class="small muted">Class link अभी add नहीं किया गया।</p>'}<div class="small muted">Class देखने के बाद PDF Library में notes और verification खोलें।</div></div>`;
  }
  const mats=currentDayMaterials();
  if(mats.length)html+=`<div class="card pdf-next-step-card"><div><b>📄 अगला चरण: PDF Verification</b><div class="muted">PDF खोलने से पहले निर्धारित questions clear करें।</div></div><button class="btn btn-blue" onclick="openPdfLibrary()">PDF Library खोलें</button></div>`;
  const ft=finalTest();
  if(ft)html+=`<div class="card final-test-card"><div class="row wrap"><div><b>📝 Final Daily Test / Submit</b><div class="muted">${ft.total_questions} Questions • Required ${ft.passing_percent||0}%</div></div><a class="btn btn-purple btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${ft.id}">Final Submit शुरू करें</a></div></div>`;
  targetsBox.innerHTML=html;
};

function openTodayVerification(){
  openPdfLibrary();
  setTimeout(()=>showActionNotice('Verification केवल PDF खोलते समय होगी। जिस PDF को पढ़ना है, उसके सामने “Read PDF” दबाएँ।','',null,'success'),150);
}

renderHome=async function(){
  const st=await statusModel();
  const classCount=currentTargets.filter(t=>t.youtube_url).length;
  const mats=currentDayMaterials();
  const finalT=finalTest();
  const youtubeUrl=esc(APP_CONFIG.YOUTUBE_URL||'#');
  const telegramUrl=esc(APP_CONFIG.TELEGRAM_URL||'#');
  homeBox.innerHTML=`<div class="premium-home-hero final-home-hero brand-only-home-hero"><div><div class="hero-kicker">GK BY PURUSHOTAM SIR</div><div class="home-slogan">अबकी बार, आखिरी बार — जीत फिक्स!</div></div><div class="hero-day-badge">DAY ${currentDay?.day_number||'-'}</div></div>
  <div class="home-action-grid final-action-grid">
    <button class="home-action-card class-card" onclick="openTodayClasses()"><div class="action-icon">▶</div><div class="action-text"><span>आज की Classes</span><b>${classCount} Available</b><small>सीधे YouTube class links खोलें</small></div></button>
    <button class="home-action-card pdf-card-home" onclick="openPdfLibrary()"><div class="action-icon">PDF</div><div class="action-text"><span>PDF Notes</span><b>${mats.length} Today</b><small>Verification clear करके PDF पढ़ें</small></div></button>
    <button class="home-action-card test-card-home" onclick="openTestsLibrary()"><div class="action-icon">T</div><div class="action-text"><span>Mock Tests</span><b>Practice + Gate</b><small>Standalone और PDF download tests</small></div></button>
    <button class="home-action-card one-card-home" onclick="openOneLinerLibrary()"><div class="action-icon">1L</div><div class="action-text"><span>One-Liners</span><b>Topic-wise</b><small>तेज revision और याद करने योग्य facts</small></div></button>
    ${finalT?`<button class="home-action-card final-submit-card" onclick="attemptFinalTargetSubmit()"><div class="action-icon">✓</div><div class="action-text"><span>Final Submit</span><b>${finalT.passing_percent||0}% Condition</b><small>पहले सभी Class PDFs verify करें</small></div></button>`:''}
  </div>
  <div class="home-brand-connect-card" aria-label="Official YouTube and Telegram channels">
    <div class="home-brand-connect-copy"><span class="section-kicker">OFFICIAL CHANNELS</span><h3>हमसे जुड़ें</h3><p>Free Classes, PDFs और जरूरी updates के लिए हमारे official channels follow करें।</p></div>
    <div class="home-brand-connect-actions">
      <a class="brand-connect-btn brand-connect-youtube" href="${youtubeUrl}" target="_blank" rel="noopener noreferrer"><span class="brand-connect-icon" aria-hidden="true"><svg class="channel-logo channel-logo-youtube" viewBox="0 0 24 24" role="img"><rect x="1.5" y="5" width="21" height="14" rx="4.5" fill="#ff0033"></rect><path d="M10 8.8 16.2 12 10 15.2Z" fill="#ffffff"></path></svg></span><span class="brand-connect-text"><b>YouTube Channel</b><small>Free Classes देखें</small></span><span class="brand-connect-arrow">↗</span></a>
      <a class="brand-connect-btn brand-connect-telegram" href="${telegramUrl}" target="_blank" rel="noopener noreferrer"><span class="brand-connect-icon" aria-hidden="true"><svg class="channel-logo channel-logo-telegram" viewBox="0 0 24 24" role="img"><circle cx="12" cy="12" r="11" fill="#229ED9"></circle><path d="M5.35 11.55 18.6 6.45c.62-.24 1.16.15.96.94l-2.25 10.6c-.17.75-.62.94-1.26.59l-3.43-2.53-1.66 1.6c-.18.18-.34.33-.69.33l.24-3.5 6.37-5.75c.28-.25-.06-.39-.43-.14l-7.87 4.96-3.39-1.06c-.74-.23-.75-.74.16-1.09Z" fill="#ffffff"></path></svg></span><span class="brand-connect-text"><b>Telegram Channel</b><small>PDF और Updates पाएँ</small></span><span class="brand-connect-arrow">↗</span></a>
    </div>
  </div>
  <div class="home-student-greeting"><div class="hello">Hello, ${esc(profile?.full_name||'Student')} 👋</div><div class="muted">आज का काम step-by-step पूरा करें।</div></div>
  <div id="homeDynamicPanel" class="hidden premium-home-panel"></div>
  <div class="status-hero ${st.key}"><div class="small">आज का संदेश</div><h2>${esc(st.title)}</h2><p>${esc(st.msg)}</p></div>
  <div class="daily-flow-ribbon"><span>▶ Class</span><i>→</i><span>📄 PDF Verification</span><i>→</i><span>👁 PDF Study</span><i>→</i><span>📝 Final Submit</span></div>
  <div class="card today-target-summary"><h3>🎯 आज पढ़ने वाले Topics</h3><div class="target-summary-list">${currentTargets.map(t=>`<div class="target-summary-row"><span class="topic-chip">${esc(t.subject)}</span><b>${esc(t.topic)}</b><span class="badge ${t.youtube_url?'badge-green':'badge-orange'}">${t.youtube_url?'Class Ready':'Link Pending'}</span></div>`).join('')}</div></div>
  <div class="stat-row" style="margin-top:10px"><div class="stat-mini"><div class="muted">Current Streak</div><div class="kpi">${profile?.current_streak||0} Days</div></div><div class="stat-mini"><div class="muted">Average Test</div><div class="kpi">${profile?.average_test_percentage||0}%</div></div></div>`;
};

loadTests=async function(){
  const r=await sb.from('tests').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).eq('status','published').order('created_at',{ascending:false});
  const rows=r.data||[];
  testsList.innerHTML=rows.map(t=>{
    const type=t.is_final_daily?'Final Daily Test':t.is_pdf_download_gate?'PDF Download Test':'Standalone Mock Test';
    return `<div class="item premium-test-list-item"><div class="row wrap"><div><span class="badge ${t.is_final_daily?'badge-purple':t.is_pdf_download_gate?'badge-orange':'badge-blue'}">${type}</span><h3>${esc(t.title)}</h3><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent||0}%${t.time_limit_minutes?` • ${t.time_limit_minutes} min`:''}</div></div><a class="btn btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${t.id}">Start Test</a></div></div>`;
  }).join('')||'<div class="card">अभी कोई Test नहीं है।</div>';
};

getMaterialVerificationContext=async function(materialId){
  const mat=await sb.from('study_materials').select('id,title,schedule_day_id,storage_path,requires_pdf_verification,pdf_verification_pass_percent,requires_class_verification').eq('id',materialId).maybeSingle();
  if(mat.error)throw mat.error;if(!mat.data)return {material:null,targets:[],questions:[]};
  const [tr,vr]=await Promise.all([
    sb.from('daily_targets').select('*').eq('schedule_day_id',mat.data.schedule_day_id).eq('status','published').order('target_order'),
    sb.from('verification_questions').select('*').eq('schedule_day_id',mat.data.schedule_day_id).eq('is_active',true).order('sort_order').order('created_at')
  ]);
  return {material:mat.data,targets:tr.data||[],questions:vr.data||[]};
};

showMaterialVerificationPanel=function(ctx){
  let host=document.getElementById('materialVerificationOverlay');
  if(!host){host=document.createElement('div');host.id='materialVerificationOverlay';host.className='material-verification-overlay';document.body.appendChild(host)}
  const targetMap=new Map((ctx.targets||[]).map(t=>[String(t.id),t]));
  const questions=ctx.questions||[],required=Number(ctx.material?.pdf_verification_pass_percent||30);
  host.innerHTML=`<div class="material-verification-modal premium-pdf-verification-modal"><div class="row wrap" style="justify-content:space-between;align-items:center"><div><div class="section-kicker">PDF UNLOCK VERIFICATION</div><h2 style="margin:4px 0">${esc(ctx.material?.title||'PDF Verification')}</h2><div class="muted">सभी questions attempt करें। कम से कम <b>${required}%</b> सही होने पर PDF खुलेगी।</div></div><button class="global-action-notice-close" onclick="closeMaterialVerification()">✕</button></div>
  <div class="pdf-verification-summary"><span>${questions.length} Questions</span><span>Passing ${required}%</span><span>Unlimited Retry</span></div>
  <div class="material-verification-list">${questions.map((v,index)=>{const opts=verificationOptionsArray(v),target=targetMap.get(String(v.target_id));return `<div class="verify-card material-vq-card"><div class="small muted">${esc(target?.subject||'PDF')} ${target?.topic?'• '+esc(target.topic):''}</div>${v.show_question!==false?`<h3>${index+1}. ${esc(v.question_text||'PDF Verification')}</h3>`:`<h3>${index+1}. सही विकल्प चुनिए</h3><div class="small muted">Question text Admin द्वारा hidden रखा गया है।</div>`}<div id="mat_choices_${v.id}" class="verification-options">${opts.map((o,i)=>`<button class="choice-option" onclick="selectMaterialVerifyOption('${v.id}',${i},this)">${String.fromCharCode(65+i)}. ${esc(o)}</button>`).join('')}</div><input type="hidden" id="mat_vq_${v.id}"></div>`}).join('')}</div>
  <div id="pdfVerificationResult" class="pdf-verification-result"></div><button id="submitPdfVerificationBtn" class="btn btn-green pdf-verification-submit" onclick="submitPdfVerificationForMaterial()">Verification Submit करें</button></div>`;
  host.classList.add('show');
};

submitPdfVerificationForMaterial=async function(){
  const ctx=materialVerificationContext;if(!ctx?.material)return;
  const answers=[];
  for(const q of ctx.questions){const val=document.getElementById('mat_vq_'+q.id)?.value;if(val===''||val==null){showActionNotice('हर question का एक option चुनना जरूरी है।','',null,'warning');return}answers.push({question_id:q.id,selected_option:Number(val)})}
  const btn=document.getElementById('submitPdfVerificationBtn'),resultBox=document.getElementById('pdfVerificationResult');
  if(btn){btn.disabled=true;btn.textContent='Checking...'}
  const r=await sb.rpc('submit_pdf_verification',{p_material_id:ctx.material.id,p_answers:answers});
  if(btn){btn.disabled=false;btn.textContent='Verification Submit करें'}
  if(r.error){if(resultBox)resultBox.innerHTML='<div class="notice notice-error">'+esc(r.error.message)+'<br><small>Supabase में RUN_THIS_FINAL_PDF_FLOW_ONCE.sql चलाना जरूरी है।</small></div>';return}
  const data=Array.isArray(r.data)?r.data[0]:r.data;
  if(data?.passed){
    if(resultBox)resultBox.innerHTML=`<div class="verification-unlocked-banner"><div><b>🎉 PDF Unlock हो गई!</b><div>Score: ${Number(data.score_percent||0).toFixed(0)}% • Required: ${Number(data.required_percent||0)}%</div></div><button class="btn btn-blue" onclick='closeMaterialVerification();readPdf(${JSON.stringify(ctx.material.id)},${JSON.stringify(ctx.material.storage_path||"")},${JSON.stringify(ctx.material.title||"PDF")})'>PDF अभी पढ़ें</button></div>`;
    if(currentDay)await sb.rpc('refresh_daily_progress',{p_user_id:user.id,p_schedule_day_id:currentDay.id});
    await renderHome();
  }else{
    if(resultBox)resultBox.innerHTML=`<div class="notice notice-error"><b>अभी condition clear नहीं हुई।</b><div>Your Score: ${Number(data?.score_percent||0).toFixed(0)}% • Required: ${Number(data?.required_percent||0)}%</div><small>सही उत्तर दिखाई नहीं जाएंगे। दोबारा पढ़कर फिर प्रयास करें।</small></div>`;
  }
};

openVerificationForMaterial=async function(materialId){
  try{
    const ctx=await getMaterialVerificationContext(materialId);materialVerificationContext=ctx;
    if(!ctx.material){showActionNotice('PDF की जानकारी नहीं मिली।','',null,'error');return}
    const requires=ctx.material.requires_pdf_verification!==false;
    if(!requires||!ctx.questions.length){showActionNotice('इस PDF के लिए verification required नहीं है।','Read PDF',()=>readPdf(ctx.material.id,ctx.material.storage_path,ctx.material.title),'success');return}
    showMaterialVerificationPanel(ctx);
  }catch(e){showActionNotice('PDF Verification खोलने में समस्या आई: '+(e.message||'Unknown error'),'',null,'error')}
};

readPdf=async function(id,path,title){
  if(!isR2PdfPath(path)){
    const ok=await sb.rpc('can_read_material',{p_material_id:id});
    if(ok.error){showActionNotice('PDF खोलने में समस्या आई: '+ok.error.message,'',null,'error');return}
    if(!ok.data){showActionNotice('पहले Class Verify कीजिए, तभी यह PDF खुलेगी।','Class Verification खोलें',()=>openVerificationForMaterial(id),'warning');return}
    const legacy=await sb.storage.from('study-pdfs').createSignedUrl(path,120);if(legacy.error){showActionNotice(legacy.error.message,'',null,'error');return}window.open(legacy.data.signedUrl,'_blank','noopener');return;
  }
  try{
    const res=await r2ApiFetch(`/material/${encodeURIComponent(id)}/read`);
    if(!res.ok){let data={};try{data=await res.json()}catch(_){}if(data.code==='VERIFICATION_REQUIRED'||res.status===403){showActionNotice(data.error||'PDF Verification condition clear करें।','PDF Verification खोलें',()=>openVerificationForMaterial(id),'warning');return}throw new Error(data.error||'PDF नहीं खुल पाई।')}
    await openR2PdfResponse(res,title,false);
  }catch(e){showActionNotice('PDF खोलने में समस्या आई: '+(e.message||'Unknown error'),'',null,'error')}
};

downloadPdf=async function(id,path,testId='',mode='direct_download',passPercent=80,title='study-material.pdf'){
  if(mode==='read_only'){toast('यह PDF Read Only है। Download उपलब्ध नहीं है।','error');return}
  const read=await sb.rpc('can_read_material',{p_material_id:id});
  if(read.error){toast(read.error.message,'error');return}
  if(!read.data){showActionNotice('पहले Class Verify कीजिए, तभी Download का अगला चरण खुलेगा।','Class Verification खोलें',()=>openVerificationForMaterial(id),'warning');return}
  if(!isR2PdfPath(path)){
    const ok=await sb.rpc('can_download_material',{p_material_id:id});if(ok.error){toast(ok.error.message,'error');return}
    if(ok.data){const rr=await sb.storage.from('study-pdfs').createSignedUrl(path,120);if(rr.error){toast(rr.error.message,'error');return}const a=document.createElement('a');a.href=rr.data.signedUrl;a.download=title;a.target='_blank';a.click();return}
  }else{
    try{const res=await r2ApiFetch(`/material/${encodeURIComponent(id)}/download`);if(res.ok){await openR2PdfResponse(res,title,true);return}let data={};try{data=await res.json()}catch(_){}if(data.code!=='TEST_REQUIRED')throw new Error(data.error||'PDF Download locked है।')}catch(e){if(!(mode==='test_required'&&testId)){toast(e.message||'PDF Download नहीं हो पाई।','error');return}}
  }
  if(mode==='test_required'&&testId){showActionNotice(`PDF Download के लिए Mock Test में ${passPercent}% score करना जरूरी है।`,'Download Mock Test शुरू करें',()=>{location.href=`m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${encodeURIComponent(testId)}&return=pdf&material=${encodeURIComponent(id)}`},'warning');return}
  toast('PDF Download अभी Locked है।','error');
};

loadPdfs=async function(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock)').eq('status','published').order('created_at',{ascending:false});
  const rows=r.data||[];materials=rows;
  pdfList.innerHTML=rows.map(m=>{const verifyRequired=m.requires_pdf_verification!==false,verifyPass=Number(m.pdf_verification_pass_percent||30);return `<div class="item pdf-read-card premium-pdf-card"><div class="row wrap"><div class="pdf-card-copy"><div class="pdf-title-row"><b>📄 ${esc(m.title)}</b><span class="badge badge-blue">Day ${m.schedule_days?.day_number||'-'}</span></div><div class="pdf-step-list"><span>${verifyRequired?`🔐 View: Verification ${verifyPass}%`:'🔓 View: Direct'}</span><span>${m.access_mode==='test_required'?`📝 Download: Mock Test ${m.download_pass_percent}%`:m.access_mode==='direct_download'?'⬇ Download: Direct after view unlock':'👁 Read Only'}</span><span>${isR2PdfPath(m.storage_path)?'☁ Secure R2 Storage':'Legacy PDF'}</span></div></div><div class="row wrap pdf-card-actions"><button class="btn btn-blue" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.title||"PDF")})'>Read PDF</button>${m.access_mode!=='read_only'?`<button class="btn btn-green" onclick='downloadPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.download_test_id||"")},${JSON.stringify(m.access_mode)},${Number(m.download_pass_percent||80)},${JSON.stringify(m.title||"study-material.pdf")})'>Download</button>`:''}</div></div></div>`}).join('')||'<div class="card">अभी कोई PDF नहीं है।</div>';
  if(currentDay)await renderHome();
};


/* ===== V11 SEPARATE CBT MOCK TEST MODULE ===== */
const __loadTargetBatchTests = loadTests;
loadTests = async function(){
  let targetHtml='';
  try{
    const r=await sb.from('tests').select('*').eq('status','published').order('created_at',{ascending:false});
    const rows=r.data||[];
    targetHtml=rows.length?`<div class="card"><h3>Target Batch के PDF/Final Tests</h3><p class="muted">ये tests केवल PDF download gate या Daily Final Submit के लिए हैं।</p>${rows.map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title||t.name||"Test")}</b><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent}%</div></div><a class="btn btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${t.id}">Open Target Test</a></div></div>`).join('')}</div>`:'';
  }catch(_){ }
  testsList.innerHTML=`<div class="card cbt-launch-card"><div class="row wrap"><div><h2>🖥 CBT Mock Test</h2><p class="muted">सभी Subjects और Topics का वास्तविक CBT-style practice test। इसका question database Target Batch से पूरी तरह अलग है।</p></div><a class="btn btn-purple" href="cbt-mock-test.html">START CBT MOCK TEST</a></div></div>${targetHtml}`;
};


/* ==================================================================
   V12.9 — CLASS-WISE PDF VERIFICATION + FINAL TARGET SUBMIT BUTTON
   ================================================================== */
getMaterialVerificationContext=async function(materialId){
  const mat=await sb.from('study_materials').select('id,title,schedule_day_id,target_id,storage_path,requires_pdf_verification,pdf_verification_pass_percent,daily_targets(subject,topic,target_order)').eq('id',materialId).maybeSingle();
  if(mat.error)throw mat.error;
  if(!mat.data)return {material:null,targets:[],questions:[]};
  let tq=sb.from('daily_targets').select('*');
  let vq=sb.from('verification_questions').select('*').eq('is_active',true).order('sort_order').order('created_at');
  if(mat.data.target_id){tq=tq.eq('id',mat.data.target_id);vq=vq.eq('target_id',mat.data.target_id)}
  else{tq=tq.eq('schedule_day_id',mat.data.schedule_day_id).order('target_order');vq=vq.eq('schedule_day_id',mat.data.schedule_day_id)}
  const [tr,vr]=await Promise.all([tq,vq]);
  return {material:mat.data,targets:tr.data||[],questions:vr.data||[]};
};

async function attemptFinalTargetSubmit(){
  if(!currentDay){showActionNotice('आज का Target उपलब्ध नहीं है।','',null,'warning');return}
  const mats=currentDayMaterials();
  if(!mats.length){showActionNotice('Admin ने आज की PDFs अभी publish नहीं की हैं।','PDF Library खोलें',()=>openPdfLibrary(),'warning');return}
  const readiness=await Promise.all(mats.map(pdfVerificationReady));
  if(!readiness.every(Boolean)){
    showActionNotice('पहले हर Class की PDF Verification पूरी करें।','PDF Library खोलें',()=>openPdfLibrary(),'warning');
    return;
  }
  const ft=finalTest();
  if(!ft){showActionNotice('Admin ने आज का Final Mock Test अभी publish नहीं किया है।','',null,'warning');return}
  const a=await bestAttempt(ft.id);
  const passed=!!a&&Number(a.percentage||0)>=Number(ft.passing_percent||0);
  if(passed){
    await sb.rpc('refresh_daily_progress',{p_user_id:user.id,p_schedule_day_id:currentDay.id});
    await Promise.all([renderTargets(),renderHome()]);
    showActionNotice('आज का Target सफलतापूर्वक Complete और Verified हो गया।','',null,'success');
    return;
  }
  showActionNotice(`Final Submission से पहले Final Mock Test में ${Number(ft.passing_percent||0)}% score करना जरूरी है।`,'Final Mock Test शुरू करें',()=>{location.href=`m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${encodeURIComponent(ft.id)}&return=final`},'warning');
}

renderTargets=async function(){
  if(!currentDay){targetsBox.innerHTML=fiveDayPreviewHtml()||'<div class="card">अभी Target उपलब्ध नहीं है।</div>';return}
  let html=fiveDayPreviewHtml()+`<div class="premium-section-head"><div><span class="section-kicker">TODAY'S TARGET</span><h2>Day ${currentDay.day_number} की Classes</h2><div class="muted">हर Class की अलग PDF और अलग Verification होगी।</div></div></div>`;
  const mats=currentDayMaterials();
  for(const t of currentTargets){
    const linked=mats.filter(m=>String(m.target_id||'')===String(t.id));
    html+=`<div class="target-card ${sclass(t.subject)}"><div class="row wrap" style="justify-content:space-between"><div><div class="small">Class ${t.target_order||'-'} • ${esc(t.subject)}</div><div class="topic">${esc(t.topic)}</div></div><span class="badge ${linked.length?'badge-green':'badge-blue'}">${linked.length?`${linked.length} PDF`:'PDF Pending'}</span></div>${t.youtube_url?`<p><a class="btn btn-red premium-action-btn" target="_blank" rel="noopener" href="${esc(t.youtube_url)}">▶ YouTube Class खोलें</a></p>`:'<p class="small muted">Class link अभी add नहीं किया गया।</p>'}${linked.length?`<div class="linked-class-pdfs">${linked.map(m=>`<button class="btn btn-blue btn-mini" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.title||"PDF")})'>📄 ${esc(m.title)}</button>`).join('')}</div>`:'<div class="small muted">इस Class की PDF अभी upload नहीं हुई।</div>'}</div>`;
  }
  html+=`<div class="card final-submit-workflow"><div><span class="section-kicker">FINAL SUBMISSION</span><h3>आज का Target Complete करें</h3><p>सभी Class PDFs verify करने के बाद Final Mock Test पास करना जरूरी है।</p></div><button class="btn btn-purple" onclick="attemptFinalTargetSubmit()">आज का Target Complete करें</button></div>`;
  targetsBox.innerHTML=html;
};

loadPdfs=async function(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock),daily_targets(subject,topic,target_order)').eq('status','published').order('created_at',{ascending:false});
  const rows=r.data||[];materials=rows;
  if(r.error){pdfList.innerHTML=`<div class="card text-error">${esc(r.error.message)}<br><small>Supabase में updated RUN_THIS_FINAL_PDF_FLOW_ONCE.sql चलाएँ।</small></div>`;return}
  pdfList.innerHTML=rows.map(m=>{const verifyRequired=m.requires_pdf_verification!==false,verifyPass=Number(m.pdf_verification_pass_percent||30);return `<div class="item pdf-read-card premium-pdf-card"><div class="row wrap"><div class="pdf-card-copy"><div class="pdf-title-row"><b>📄 ${esc(m.title)}</b><span class="badge badge-blue">Day ${m.schedule_days?.day_number||'-'} • Class ${m.daily_targets?.target_order||'-'}</span></div><div class="pdf-linked-class">${esc(m.daily_targets?.subject||'Legacy PDF')} • ${esc(m.daily_targets?.topic||'Class link not set')}</div><div class="pdf-step-list"><span>${verifyRequired?`🔐 पहले Class Verify करें: ${verifyPass}%`:'🔓 View: Direct'}</span><span>${m.access_mode==='test_required'?`📝 Download से पहले Mock Test: ${m.download_pass_percent}%`:m.access_mode==='direct_download'?'⬇ Download: Direct after view unlock':'👁 Read Only'}</span><span>${isR2PdfPath(m.storage_path)?'☁ Secure R2 Storage':'Legacy PDF'}</span></div></div><div class="row wrap pdf-card-actions"><button class="btn btn-blue" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.title||"PDF")})'>पहले Class Verify करें / PDF खोलें</button>${m.access_mode!=='read_only'?`<button class="btn btn-green" onclick='downloadPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.download_test_id||"")},${JSON.stringify(m.access_mode)},${Number(m.download_pass_percent||80)},${JSON.stringify(m.title||"study-material.pdf")})'>Download</button>`:''}</div></div></div>`}).join('')||'<div class="card">अभी कोई PDF नहीं है।</div>';
  if(currentDay)await renderHome();
};

loadTests=async function(){
  let targetHtml='';
  try{
    const r=await sb.from('tests').select('*').eq('status','published').order('created_at',{ascending:false});
    const rows=r.data||[];
    const standalone=rows.filter(t=>!t.is_final_daily&&!t.is_pdf_download_gate);
    targetHtml=standalone.length?`<div class="card"><h3>Standalone Practice Tests</h3>${standalone.map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title||t.name||"Test")}</b><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent}%</div></div><a class="btn btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${t.id}">Start Practice</a></div></div>`).join('')}</div>`:'<div class="card"><p class="muted">अभी कोई standalone practice test publish नहीं है। PDF Gate Test Download के समय और Final Test “आज का Target Complete करें” पर खुलेगा।</p></div>';
  }catch(_){ }
  testsList.innerHTML=`<div class="card cbt-launch-card"><div class="row wrap"><div><h2>🖥 CBT Mock Test</h2><p class="muted">सभी Subjects और Topics का वास्तविक CBT-style practice test। इसका question database Target Batch से अलग है।</p></div><a class="btn btn-purple" href="cbt-mock-test.html">START CBT MOCK TEST</a></div></div>${targetHtml}`;
};

const __v129StudentInit=init;
init=async function(){await __v129StudentInit();};



/* ==================================================================
   V12.12 — STUDENT FLEXIBLE TIMETABLE + CLASS TIMING
   ================================================================== */
function localDateKey(){
  const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function classClockText(value){
  if(!value)return'';const [h,m]=String(value).slice(0,5).split(':').map(Number);const ap=h>=12?'PM':'AM';return `${(h%12)||12}:${String(m).padStart(2,'0')} ${ap}`;
}
function targetTimingText(t){
  if(t.start_time&&t.end_time)return `${classClockText(t.start_time)} – ${classClockText(t.end_time)}`;
  if(t.start_time)return `${classClockText(t.start_time)} से`;
  return 'Timing जल्द बताई जाएगी';
}
function targetLiveState(t){
  if(!currentDay||currentDay.day_date!==localDateKey()||!t.start_time)return {key:'scheduled',label:'Scheduled'};
  const now=new Date();const nowMin=now.getHours()*60+now.getMinutes();
  const parts=v=>String(v||'').slice(0,5).split(':').map(Number);
  const [sh,sm]=parts(t.start_time);const start=sh*60+sm;
  if(t.end_time){const [eh,em]=parts(t.end_time);const end=eh*60+em;if(nowMin>=start&&nowMin<=end)return {key:'live',label:'LIVE NOW'};if(nowMin>end)return {key:'passed',label:'Time Passed'};}
  if(nowMin<start)return {key:'upcoming',label:'Upcoming'};
  return {key:'live',label:'LIVE NOW'};
}

loadCurrentDay=async function(){
  const today=localDateKey();
  const r=await sb.from('schedule_days').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).eq('manual_lock',false).or(`manual_unlock.eq.true,and(manual_unlock.eq.false,day_date.lte.${today})`).order('day_number',{ascending:false}).limit(1).maybeSingle();
  currentDay=r.data;currentTargets=[];verificationRows=[];materials=[];tests=[];targetCompletionMap.clear();
  if(!currentDay)return;
  const [tr,tc,vr,mr,te]=await Promise.all([
    sb.from('daily_targets').select('*').eq('schedule_day_id',currentDay.id).eq('status','published').order('target_order'),
    sb.from('target_completions').select('*').eq('user_id',user.id),
    sb.from('verification_questions').select('*').eq('schedule_day_id',currentDay.id).eq('is_active',true).order('created_at'),
    sb.from('study_materials').select('*').eq('schedule_day_id',currentDay.id).eq('status','published').order('created_at'),
    sb.from('tests').select('*').eq('schedule_day_id',currentDay.id).eq('status','published').order('created_at')
  ]);
  currentTargets=(tr.data||[]).filter(t=>(t.class_status||'scheduled')!=='cancelled');
  (tc.data||[]).forEach(x=>targetCompletionMap.set(x.target_id,x));verificationRows=vr.data||[];materials=mr.data||[];tests=te.data||[];
};

attemptFinalTargetSubmit=async function(){
  if(!currentDay){showActionNotice('आज का Target उपलब्ध नहीं है।','',null,'warning');return}
  const mats=currentDayMaterials();
  const missing=currentTargets.filter(t=>!mats.some(m=>String(m.target_id||'')===String(t.id)));
  if(missing.length){showActionNotice(`आज की ${missing.length} active Class की PDF अभी publish नहीं हुई है।`,'PDF Library खोलें',()=>openPdfLibrary(),'warning');return}
  const readiness=await Promise.all(mats.map(pdfVerificationReady));
  if(!readiness.every(Boolean)){showActionNotice('पहले हर Class की PDF Verification पूरी करें।','PDF Library खोलें',()=>openPdfLibrary(),'warning');return}
  const ft=finalTest();
  if(!ft){showActionNotice('Admin ने आज का Final Mock Test अभी publish नहीं किया है।','',null,'warning');return}
  const a=await bestAttempt(ft.id);const passed=!!a&&Number(a.percentage||0)>=Number(ft.passing_percent||0);
  if(passed){await sb.rpc('refresh_daily_progress',{p_user_id:user.id,p_schedule_day_id:currentDay.id});await Promise.all([renderTargets(),renderHome()]);showActionNotice('आज का Target सफलतापूर्वक Complete और Verified हो गया।','',null,'success');return}
  showActionNotice(`Final Submission से पहले Final Mock Test में ${Number(ft.passing_percent||0)}% score करना जरूरी है।`,'Final Mock Test शुरू करें',()=>{location.href=`m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${encodeURIComponent(ft.id)}&return=final`},'warning');
};

renderTargets=async function(){
  if(!currentDay){targetsBox.innerHTML=fiveDayPreviewHtml()||'<div class="card">अभी Target उपलब्ध नहीं है।</div>';return}
  let html=fiveDayPreviewHtml()+`<div class="premium-section-head"><div><span class="section-kicker">TODAY'S TIMETABLE</span><h2>Day ${currentDay.day_number} की ${currentTargets.length} Classes</h2><div class="muted">${fmtDate(currentDay.day_date)} • Timing और Extra Classes Admin द्वारा live edit हो सकती हैं।</div></div></div>`;
  const mats=currentDayMaterials();
  for(const [idx,t] of currentTargets.entries()){
    const linked=mats.filter(m=>String(m.target_id||'')===String(t.id));const live=targetLiveState(t);
    html+=`<div class="target-card ${sclass(t.subject)} student-timed-class ${live.key}"><div class="class-timing-strip"><span>🕒 ${esc(targetTimingText(t))}</span><span class="live-state ${live.key}">${live.label}</span></div><div class="row wrap" style="justify-content:space-between"><div><div class="small">Class ${idx+1} • ${esc(t.subject)} ${t.is_extra_class?'• Extra Class':''}</div><div class="topic">${esc(t.topic)}</div>${t.class_note?`<div class="class-note">${esc(t.class_note)}</div>`:''}</div><span class="badge ${linked.length?'badge-green':'badge-blue'}">${linked.length?`${linked.length} PDF`:'PDF Pending'}</span></div>${t.youtube_url?`<p><a class="btn btn-red premium-action-btn" target="_blank" rel="noopener" href="${esc(t.youtube_url)}">▶ YouTube Class खोलें</a></p>`:'<p class="small muted">Class link अभी add नहीं किया गया।</p>'}${linked.length?`<div class="linked-class-pdfs">${linked.map(m=>`<button class="btn btn-blue btn-mini" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||'')},${JSON.stringify(m.title||'PDF')})'>📄 ${esc(m.title)}</button>`).join('')}</div>`:'<div class="small muted">इस Class की PDF अभी upload नहीं हुई।</div>'}</div>`;
  }
  html+=`<div class="card final-submit-workflow"><div><span class="section-kicker">FINAL SUBMISSION</span><h3>आज का Target Complete करें</h3><p>सभी active Classes की PDF verify करने के बाद Final Mock Test पास करना जरूरी है।</p></div><button class="btn btn-purple" onclick="attemptFinalTargetSubmit()">आज का Target Complete करें</button></div>`;
  targetsBox.innerHTML=html;
};

const __v1212RenderHome=renderHome;
renderHome=async function(){
  await __v1212RenderHome();
  const list=document.querySelector('#homeBox .today-target-summary .target-summary-list');
  if(list)list.innerHTML=currentTargets.map((t,idx)=>{const live=targetLiveState(t);return `<div class="target-summary-row timed-summary-row"><span class="topic-chip">Class ${idx+1} • ${esc(t.subject)}</span><div><b>${esc(t.topic)}</b><small>🕒 ${esc(targetTimingText(t))}${t.is_extra_class?' • Extra Class':''}</small></div><span class="badge ${live.key==='live'?'badge-red':t.youtube_url?'badge-green':'badge-orange'}">${live.key==='live'?'LIVE':t.youtube_url?'Ready':'Link Pending'}</span></div>`}).join('');
  const classCard=document.querySelector('#homeBox .home-action-card.class-card b');if(classCard)classCard.textContent=`${currentTargets.length} Classes Today`;
};

loadPdfs=async function(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock),daily_targets(subject,topic,target_order,class_status)').eq('status','published').order('created_at',{ascending:false});
  const rows=(r.data||[]).filter(m=>(m.daily_targets?.class_status||'scheduled')!=='cancelled');materials=rows;
  if(r.error){pdfList.innerHTML=`<div class="card text-error">${esc(r.error.message)}<br><small>Supabase में V12.12 SQL चलाएँ।</small></div>`;return}
  pdfList.innerHTML=rows.map(m=>{const verifyRequired=m.requires_pdf_verification!==false,verifyPass=Number(m.pdf_verification_pass_percent||30);return `<div class="item pdf-read-card premium-pdf-card"><div class="row wrap"><div class="pdf-card-copy"><div class="pdf-title-row"><b>📄 ${esc(m.title)}</b><span class="badge badge-blue">Day ${m.schedule_days?.day_number||'-'} • Class ${m.daily_targets?.target_order||'-'}</span></div><div class="pdf-linked-class">${esc(m.daily_targets?.subject||'Legacy PDF')} • ${esc(m.daily_targets?.topic||'Class link not set')}</div><div class="pdf-step-list"><span>${verifyRequired?`🔐 पहले Class Verify करें: ${verifyPass}%`:'🔓 View: Direct'}</span><span>${m.access_mode==='test_required'?`📝 Download से पहले Mock Test: ${m.download_pass_percent}%`:m.access_mode==='direct_download'?'⬇ Download: Direct after view unlock':'👁 Read Only'}</span><span>${isR2PdfPath(m.storage_path)?'☁ Secure R2 Storage':'Legacy PDF'}</span></div></div><div class="row wrap pdf-card-actions"><button class="btn btn-blue" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||'')},${JSON.stringify(m.title||'PDF')})'>पहले Class Verify करें / PDF खोलें</button>${m.access_mode!=='read_only'?`<button class="btn btn-green" onclick='downloadPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||'')},${JSON.stringify(m.download_test_id||'')},${JSON.stringify(m.access_mode)},${Number(m.download_pass_percent||80)},${JSON.stringify(m.title||'study-material.pdf')})'>Download</button>`:''}</div></div></div>`}).join('')||'<div class="card">अभी कोई PDF नहीं है।</div>';
  if(currentDay)await renderHome();
};

const __v1212StudentInit=init;
init=async function(){await __v1212StudentInit();};

/* ==================================================================
   V12.13 — STUDENT VISIBILITY ENFORCEMENT
   ================================================================== */
function v1213DayAvailable(day){
  if(!day||day.manual_lock===true)return false;
  return day.manual_unlock===true||String(day.day_date||'')<=localDateKey();
}
function v1213TargetVisible(target,day){
  if(day?.manual_lock===true)return false;
  const mode=target?.visibility_mode||'auto';
  if(mode==='hide')return false;
  if(mode==='show')return true;
  return v1213DayAvailable(day);
}
function v1213MaterialVisible(material){
  if(material?.student_visible!==true)return false;
  const day=material.schedule_days||null;
  const target=material.daily_targets||null;
  if(!v1213DayAvailable(day))return false;
  if(target&&!v1213TargetVisible(target,day))return false;
  return (target?.class_status||'scheduled')!=='cancelled';
}

loadFiveDayPreview=async function(){
  const all=await sb.from('schedule_days').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).order('day_number');
  const daysAll=all.data||[];let start=0;
  if(currentDay){const idx=daysAll.findIndex(d=>String(d.id)===String(currentDay.id));start=idx<0?0:idx;}
  else{const idx=daysAll.findIndex(d=>String(d.day_date||'')>=localDateKey());start=idx<0?Math.max(0,daysAll.length-5):idx;}
  previewDays=daysAll.slice(start,start+5);if(!previewDays.length){previewTargets=[];return}
  const r=await sb.from('daily_targets').select('*').in('schedule_day_id',previewDays.map(d=>d.id)).eq('status','published').order('target_order');
  const dayMap=new Map(previewDays.map(d=>[String(d.id),d]));
  previewTargets=(r.data||[]).filter(t=>v1213TargetVisible(t,dayMap.get(String(t.schedule_day_id)))&&(t.class_status||'scheduled')!=='cancelled');
};

loadCurrentDay=async function(){
  const today=localDateKey();
  const r=await sb.from('schedule_days').select('*').eq('batch_id',APP_CONFIG.BATCH_ID).eq('manual_lock',false).or(`manual_unlock.eq.true,and(manual_unlock.eq.false,day_date.lte.${today})`).order('day_number',{ascending:false}).limit(1).maybeSingle();
  currentDay=r.data;currentTargets=[];verificationRows=[];materials=[];tests=[];targetCompletionMap.clear();if(!currentDay)return;
  const [tr,tc,vr,mr,te]=await Promise.all([
    sb.from('daily_targets').select('*').eq('schedule_day_id',currentDay.id).eq('status','published').order('target_order'),
    sb.from('target_completions').select('*').eq('user_id',user.id),
    sb.from('verification_questions').select('*').eq('schedule_day_id',currentDay.id).eq('is_active',true).order('created_at'),
    sb.from('study_materials').select('*').eq('schedule_day_id',currentDay.id).eq('status','published').eq('student_visible',true).order('created_at'),
    sb.from('tests').select('*').eq('schedule_day_id',currentDay.id).eq('status','published').eq('student_visible',true).order('created_at')
  ]);
  currentTargets=(tr.data||[]).filter(t=>v1213TargetVisible(t,currentDay)&&(t.class_status||'scheduled')!=='cancelled');
  const allowedTargetIds=new Set(currentTargets.map(t=>String(t.id)));
  (tc.data||[]).forEach(x=>targetCompletionMap.set(x.target_id,x));
  verificationRows=(vr.data||[]).filter(q=>!q.target_id||allowedTargetIds.has(String(q.target_id)));
  materials=(mr.data||[]).filter(m=>!m.target_id||allowedTargetIds.has(String(m.target_id)));
  tests=te.data||[];
};

getMaterialVerificationContext=async function(materialId){
  const mat=await sb.from('study_materials').select('id,title,schedule_day_id,target_id,storage_path,requires_pdf_verification,pdf_verification_pass_percent,requires_class_verification,student_visible,schedule_days(day_number,day_date,manual_lock,manual_unlock),daily_targets(subject,topic,target_order,class_status,visibility_mode)').eq('id',materialId).eq('status','published').eq('student_visible',true).maybeSingle();
  if(mat.error)throw mat.error;if(!mat.data||!v1213MaterialVisible(mat.data))return {material:null,targets:[],questions:[]};
  const [tr,vr]=await Promise.all([
    sb.from('daily_targets').select('*').eq('schedule_day_id',mat.data.schedule_day_id).eq('status','published').order('target_order'),
    sb.from('verification_questions').select('*').eq('schedule_day_id',mat.data.schedule_day_id).eq('is_active',true).order('sort_order').order('created_at')
  ]);
  const allowed=(tr.data||[]).filter(t=>v1213TargetVisible(t,mat.data.schedule_days)&&(t.class_status||'scheduled')!=='cancelled');
  const allowedIds=new Set(allowed.map(t=>String(t.id)));
  return {material:mat.data,targets:allowed,questions:(vr.data||[]).filter(q=>!q.target_id||allowedIds.has(String(q.target_id)))};
};

loadPdfs=async function(){
  const r=await sb.from('study_materials').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock),daily_targets(subject,topic,target_order,class_status,visibility_mode)').eq('status','published').eq('student_visible',true).order('created_at',{ascending:false});
  const rows=(r.data||[]).filter(v1213MaterialVisible);materials=rows;
  if(r.error){pdfList.innerHTML=`<div class="card text-error">${esc(r.error.message)}<br><small>Supabase में V12.14 Complete SQL चलाएँ।</small></div>`;return}
  pdfList.innerHTML=rows.map(m=>{const verifyRequired=m.requires_pdf_verification!==false,verifyPass=Number(m.pdf_verification_pass_percent||30);return `<div class="item pdf-read-card premium-pdf-card"><div class="row wrap"><div class="pdf-card-copy"><div class="pdf-title-row"><b>📄 ${esc(m.title)}</b><span class="badge badge-blue">Day ${m.schedule_days?.day_number||'-'} • Class ${m.daily_targets?.target_order||'-'}</span></div><div class="pdf-linked-class">${esc(m.daily_targets?.subject||'Legacy PDF')} • ${esc(m.daily_targets?.topic||'Class link not set')}</div><div class="pdf-step-list"><span>${verifyRequired?`🔐 पहले Class Verify करें: ${verifyPass}%`:'🔓 View: Direct'}</span><span>${m.access_mode==='test_required'?`📝 Download से पहले Mock Test: ${m.download_pass_percent}%`:m.access_mode==='direct_download'?'⬇ Download: Direct after view unlock':'👁 Read Only'}</span><span>${isR2PdfPath(m.storage_path)?'☁ Secure R2 Storage':'Legacy PDF'}</span></div></div><div class="row wrap pdf-card-actions"><button class="btn btn-blue" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||'')},${JSON.stringify(m.title||'PDF')})'>पहले Class Verify करें / PDF खोलें</button>${m.access_mode!=='read_only'?`<button class="btn btn-green" onclick='downloadPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||'')},${JSON.stringify(m.download_test_id||'')},${JSON.stringify(m.access_mode)},${Number(m.download_pass_percent||80)},${JSON.stringify(m.title||'study-material.pdf')})'>Download</button>`:''}</div></div></div>`}).join('')||'<div class="card">अभी कोई PDF उपलब्ध नहीं है।</div>';
  if(currentDay)await renderHome();
};

loadTests=async function(){
  let targetHtml='';
  try{
    const r=await sb.from('tests').select('*,schedule_days(day_number,day_date,manual_lock,manual_unlock)').eq('status','published').eq('student_visible',true).order('created_at',{ascending:false});
    const rows=(r.data||[]).filter(t=>!t.schedule_day_id||v1213DayAvailable(t.schedule_days));
    const standalone=rows.filter(t=>!t.is_final_daily&&!t.is_pdf_download_gate);
    targetHtml=standalone.length?`<div class="card"><h3>Standalone Practice Tests</h3>${standalone.map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title||t.name||'Test')}</b><div class="muted">${t.total_questions} Questions • Pass ${t.passing_percent}%</div></div><a class="btn btn-blue" href="m7q2t9v4-x8k5r3p6-n1z7c4l8.html?id=${t.id}">Start Practice</a></div></div>`).join('')}</div>`:'<div class="card"><p class="muted">अभी कोई standalone practice test Show नहीं किया गया है।</p></div>';
  }catch(_){targetHtml='<div class="card"><p class="muted">Tests load नहीं हुए।</p></div>'}
  testsList.innerHTML=`<div class="card cbt-launch-card"><div class="row wrap"><div><h2>🖥 CBT Mock Test</h2><p class="muted">केवल Admin द्वारा Show किए गए Topics और Questions ही दिखाई देंगे।</p></div><a class="btn btn-purple" href="cbt-mock-test.html">START CBT MOCK TEST</a></div></div>${targetHtml}`;
};

const __v1213StudentInit=init;
init=async function(){await __v1213StudentInit();};

init();
