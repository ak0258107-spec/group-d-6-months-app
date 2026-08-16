let user=null,profile=null,ytRows=[],posterRows=[],importantRows=[],posterObjectUrls=[];
let classGroups=[],classCoveredOptions=[];
const CLASS_GROUP_MERGE={haryana_gk_003:'haryana_gk_002'};
const CLASS_GROUP_NAMES={haryana_gk_002:'प्राचीन हरियाणा, पुरातात्विक स्थल एवं हड़प्पा सभ्यता'};
function byId(id){return document.getElementById(id)}
const STUDENT_TABS=['home','classes','poster','cbt','revision','profile'];
const UPDATE_CHANNELS=new Set(['classes','poster','cbt']);
function navButton(name){return document.querySelector(`.bottom-student-nav button[data-tab="${name}"]`)}
async function tab(name,el){
  if(!STUDENT_TABS.includes(name))name='home';
  STUDENT_TABS.forEach(x=>byId(x+'Tab')?.classList.toggle('hidden',x!==name));
  const navName=name==='revision'?'home':name;
  document.querySelectorAll('.bottom-student-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===navName));
  if(UPDATE_CHANNELS.has(name))await markChannelSeen(name);
  if(name==='home')await loadHome();
  if(name==='classes')await loadClasses();
  if(name==='poster')await loadPosters();
  if(name==='revision')await loadRevision();
  if(name==='profile')await renderProfile();
  window.scrollTo({top:0,behavior:'smooth'});
}
function goStudentHome(){tab('home')}
function avatarPath(gender){return gender==='girl'?'avatar-girl.svg':gender==='boy'?'avatar-boy.svg':'avatar-student.svg'}
function setUpdateIndicator(channel,on){
  const btn=navButton(channel);if(!btn)return;
  btn.classList.toggle('has-update',!!on);
  const dot=btn.querySelector('.update-dot');if(dot)dot.classList.toggle('hidden',!on);
}
async function refreshTabUpdates(){
  if(!user)return;
  try{
    const [stateRes,seenRes]=await Promise.all([
      sb.from('app_content_channels').select('channel,version,updated_at'),
      sb.from('student_content_seen').select('channel,seen_version').eq('student_id',user.id)
    ]);
    if(stateRes.error||seenRes.error)return;
    const seen=new Map((seenRes.data||[]).map(x=>[x.channel,Number(x.seen_version||0)]));
    (stateRes.data||[]).forEach(row=>setUpdateIndicator(row.channel,Number(row.version||0)>Number(seen.get(row.channel)||0)));
  }catch(_){ }
}
async function markChannelSeen(channel){
  if(!user||!UPDATE_CHANNELS.has(channel))return;
  try{
    const s=await sb.from('app_content_channels').select('version').eq('channel',channel).maybeSingle();
    if(s.error)return;
    const version=Number(s.data?.version||0);
    const r=await sb.from('student_content_seen').upsert({student_id:user.id,channel,seen_version:version,seen_at:new Date().toISOString()},{onConflict:'student_id,channel'});
    if(!r.error)setUpdateIndicator(channel,false);
  }catch(_){ }
}
function allHaryanaClassTopics(){
  const src=window.topicsData?.haryana_gk?.topics||[];
  return src.map((t,i)=>({key:t.key||`haryana_gk_${String(i+1).padStart(3,'0')}`,name:t.name||t.topic_name||t.key,order:i+1}));
}
function canonicalClassGroupKey(key){return CLASS_GROUP_MERGE[key]||key||''}
function canonicalClassGroupName(key,fallback=''){
  const ck=canonicalClassGroupKey(key);
  if(CLASS_GROUP_NAMES[ck])return CLASS_GROUP_NAMES[ck];
  const t=allHaryanaClassTopics().find(x=>x.key===ck);
  return t?.name||fallback||ck;
}
function classGroupMasterOrder(key){
  const ck=canonicalClassGroupKey(key),seen=[];
  for(const t of allHaryanaClassTopics()){const k=canonicalClassGroupKey(t.key);if(!seen.includes(k))seen.push(k)}
  const i=seen.indexOf(ck);return i>=0?i+1:9999;
}
function normalizeCoveredTopics(c){
  let raw=c?.covered_topics;
  if(typeof raw==='string'){try{raw=JSON.parse(raw)}catch(_){raw=[]}}
  if(!Array.isArray(raw))raw=[];
  const all=allHaryanaClassTopics(),byKey=new Map(all.map(x=>[x.key,x]));
  const out=[];
  for(const item of raw){
    const key=typeof item==='string'?item:String(item?.key||'');
    if(!key)continue;
    const name=typeof item==='string'?(byKey.get(key)?.name||key):String(item?.name||byKey.get(key)?.name||key);
    if(!out.some(x=>x.key===key))out.push({key,name});
  }
  if(!out.length&&c?.topic_key)out.push({key:c.topic_key,name:c.topic_name||byKey.get(c.topic_key)?.name||c.topic_key});
  return out;
}
function classTone(i){return `tone-${(i%6)+1}`}
function classCardHtml(c,toneIndex=0,focusKey=''){
  const topics=normalizeCoveredTopics(c),focused=focusKey&&topics.some(t=>t.key===focusKey);
  const chips=topics.map(t=>`<span class="class-topic-chip">${esc(t.name)}</span>`).join('');
  return `<article id="class-${esc(c.id)}" class="yt-class-card ${classTone(toneIndex)} ${focused?'topic-focus':''}"><div class="yt-class-content"><div class="yt-class-meta"><span>${esc(c.group_name||canonicalClassGroupName(c.group_key||c.topic_key,c.topic_name))}</span><b>Part ${Number(c.part_no||1)}</b></div><h3>${esc(c.class_title||topics.map(x=>x.name).join(' | ')||c.topic_name)}</h3>${chips?`<div class="class-topic-chips">${chips}</div>`:''}<p>${esc(c.tagline)}</p><a class="btn class-watch-btn full-btn" href="${esc(c.youtube_url)}" target="_blank" rel="noopener">▶ Watch Now</a></div></article>`;
}
function buildClassGroups(rows){
  const groups=new Map();
  rows.forEach(c=>{
    const key=canonicalClassGroupKey(c.group_key||c.topic_key),name=c.group_name||canonicalClassGroupName(key,c.topic_name),order=Number(c.group_order||classGroupMasterOrder(key));
    if(!groups.has(key))groups.set(key,{key,name,order,rows:[],covered:new Map()});
    const g=groups.get(key);g.rows.push(c);normalizeCoveredTopics(c).forEach(t=>g.covered.set(t.key,t));
  });
  const out=[...groups.values()];
  out.forEach(g=>g.rows.sort((a,b)=>Number(a.part_no||1)-Number(b.part_no||1)||Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.created_at||'').localeCompare(String(b.created_at||''))));
  return out.sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'hi'));
}
function buildCoveredOptions(rows){
  const map=new Map();rows.forEach(c=>normalizeCoveredTopics(c).forEach(t=>map.set(t.key,t)));
  const order=new Map(allHaryanaClassTopics().map((t,i)=>[t.key,i]));
  return [...map.values()].sort((a,b)=>(order.get(a.key)??9999)-(order.get(b.key)??9999)||a.name.localeCompare(b.name,'hi'));
}
function renderClassLanding(){
  const host=byId('classesBox');if(!host)return;
  const opts=classCoveredOptions.map(t=>`<option value="${esc(t.key)}">${esc(t.name)}</option>`).join('');
  const cards=classGroups.map((g,i)=>`<button class="class-topic-card ${classTone(i)}" onclick="openClassGroup('${esc(g.key)}')"><span class="class-topic-number">${String(i+1).padStart(2,'0')}</span><span class="class-topic-copy"><b>${esc(g.name)}</b><small>${g.rows.length} Class${g.rows.length===1?'':'es'} • ${g.covered.size} पढ़ाए Topic</small></span><span class="class-topic-arrow">›</span></button>`).join('');
  host.innerHTML=`<div class="class-search-panel"><div class="class-search-title"><b>🔎 पढ़ाया हुआ Topic खोजें</b><small>जिस Topic पर क्लिक करेंगे, उसी से जुड़ी Class सामने आ जाएगी।</small></div><select id="classTopicSelect" onchange="jumpToClassTopic(this.value)"><option value="">-- Topic चुनें --</option>${opts}</select><input id="classTopicTextSearch" type="search" placeholder="Topic नाम लिखें… जैसे वैदिक काल, सिंधु घाटी" oninput="filterClassTopicSearch(this.value)"><div id="classSearchSuggestions" class="class-search-suggestions hidden"></div></div><div class="class-topic-grid">${cards}</div>`;
}
window.openClassGroup=function(key,focusKey=''){
  const host=byId('classesBox'),g=classGroups.find(x=>x.key===key);if(!host||!g)return;
  host.innerHTML=`<button class="class-back-btn" onclick="renderClassLanding()">← सभी Topics</button><div class="class-group-head ${classTone(Math.max(0,classGroups.indexOf(g)))}"><span class="class-topic-number">${String(classGroups.indexOf(g)+1).padStart(2,'0')}</span><div><h2>${esc(g.name)}</h2><p>${g.rows.length} Classes • Part क्रम में</p></div></div><div class="yt-student-grid">${g.rows.map((c,i)=>classCardHtml(c,i,focusKey)).join('')}</div>`;
  setTimeout(()=>{const f=focusKey?g.rows.find(c=>normalizeCoveredTopics(c).some(t=>t.key===focusKey)):null;const el=f?byId(`class-${f.id}`):null;(el||host).scrollIntoView({behavior:'smooth',block:'start'})},60);
}
window.jumpToClassTopic=function(key){
  if(!key){renderClassLanding();return}
  const matches=ytRows.filter(c=>normalizeCoveredTopics(c).some(t=>t.key===key));
  if(!matches.length){toast('इस Topic की कोई visible Class नहीं मिली।','error');return}
  const groupKeys=[...new Set(matches.map(c=>canonicalClassGroupKey(c.group_key||c.topic_key)))];
  if(groupKeys.length===1){openClassGroup(groupKeys[0],key);return}
  const host=byId('classesBox'),topic=classCoveredOptions.find(t=>t.key===key);
  host.innerHTML=`<button class="class-back-btn" onclick="renderClassLanding()">← सभी Topics</button><div class="class-result-head"><b>${esc(topic?.name||'Selected Topic')}</b><span>${matches.length} relevant Classes</span></div><div class="yt-student-grid">${matches.sort((a,b)=>classGroupMasterOrder(a.group_key||a.topic_key)-classGroupMasterOrder(b.group_key||b.topic_key)||Number(a.part_no||1)-Number(b.part_no||1)).map((c,i)=>classCardHtml(c,i,key)).join('')}</div>`;
}
window.filterClassTopicSearch=function(query){
  const box=byId('classSearchSuggestions');if(!box)return;const q=String(query||'').trim().toLowerCase();if(!q){box.classList.add('hidden');box.innerHTML='';return}
  const matches=classCoveredOptions.filter(t=>t.name.toLowerCase().includes(q)).slice(0,12);
  box.innerHTML=matches.map(t=>`<button onclick="jumpToClassTopic('${esc(t.key)}')">${esc(t.name)}</button>`).join('')||'<span>कोई पढ़ाया हुआ Topic नहीं मिला।</span>';box.classList.remove('hidden');
}
async function loadClasses(){
  const host=byId('classesBox');if(!host)return;host.innerHTML='<div class="item">Haryana GK Classes load हो रही हैं…</div>';
  const r=await sb.from('haryana_youtube_classes').select('*').eq('student_visible',true);
  if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V16 SQL run करें।</small></div>`;return}
  ytRows=(r.data||[]).sort((a,b)=>classGroupMasterOrder(a.group_key||a.topic_key)-classGroupMasterOrder(b.group_key||b.topic_key)||Number(a.part_no||1)-Number(b.part_no||1)||Number(a.sort_order||0)-Number(b.sort_order||0));
  classGroups=buildClassGroups(ytRows);classCoveredOptions=buildCoveredOptions(ytRows);
  if(!ytRows.length){host.innerHTML='<div class="item">अभी कोई Haryana GK Class publish नहीं है।</div>';return}
  renderClassLanding();
}
window.renderClassLanding=renderClassLanding;

async function posterImageUrl(key){
  if(!key)return '';
  const r=await r2ApiFetch(`/poster?key=${encodeURIComponent(key)}`);if(!r.ok)throw new Error(await r2ErrorMessage(r,'Poster load failed'));
  const u=URL.createObjectURL(await r.blob());posterObjectUrls.push(u);return u;
}
async function loadPosters(){
  const host=byId('posterBox');if(!host)return;host.innerHTML='<div class="item">Posters load हो रहे हैं…</div>';
  posterObjectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});posterObjectUrls=[];
  const r=await sb.from('app_posters').select('*').eq('student_visible',true).order('pinned',{ascending:false}).order('sort_order').order('created_at',{ascending:false});
  if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V16 SQL run करें।</small></div>`;return}
  posterRows=r.data||[];const cards=[];
  for(const p of posterRows){
    let src='';try{src=await posterImageUrl(p.image_key)}catch(_){ }
    cards.push(`<article class="poster-card">${p.pinned?'<div class="poster-pin">📌 Important</div>':''}${src?`<img class="poster-image" src="${src}" alt="${esc(p.title||'Announcement Poster')}">`:'<div class="item text-error">Poster image load नहीं हुई।</div>'}<div class="poster-copy">${p.title?`<h3>${esc(p.title)}</h3>`:''}${p.message?`<p>${esc(p.message)}</p>`:''}${p.action_url&&p.action_label?`<a class="btn btn-blue full-btn" href="${esc(p.action_url)}" target="_blank" rel="noopener">${esc(p.action_label)}</a>`:''}</div></article>`);
  }
  host.innerHTML=cards.join('')||'<div class="item">अभी कोई Poster / Announcement publish नहीं है।</div>';
}
async function loadImportantInformation(){
  try{
    const r=await sb.from('app_important_information').select('*').eq('student_visible',true).order('pinned',{ascending:false}).order('sort_order').order('created_at',{ascending:false}).limit(8);
    if(r.error)return [];
    importantRows=r.data||[];
    return importantRows;
  }catch(_){return []}
}
async function loadHome(){
  const host=byId('homeBox');if(!host)return;host.innerHTML='<div class="item">Dashboard load हो रहा है…</div>';
  let weak=0,bookmarks=0,attempts=0,visibleSubjects=0,info=[],latestClass=null,latestPoster=null;
  try{
    const [w,b,a,p,sv,ir,lc,lp]=await Promise.all([
      sb.from('cbt_student_weak_questions').select('question_key',{count:'exact',head:true}).eq('student_id',user.id).eq('mastered',false),
      sb.from('cbt_bookmarks').select('question_key',{count:'exact',head:true}).eq('student_id',user.id),
      sb.from('cbt_test_attempts').select('id',{count:'exact',head:true}).eq('student_id',user.id),
      sb.from('cbt_practice_history').select('id',{count:'exact',head:true}).eq('student_id',user.id),
      sb.from('cbt_subject_visibility').select('subject_key',{count:'exact',head:true}).eq('student_visible',true),
      loadImportantInformation(),
      sb.from('haryana_youtube_classes').select('class_title,topic_name,part_no,created_at').eq('student_visible',true).order('created_at',{ascending:false}).limit(1),
      sb.from('app_posters').select('title,message,created_at').eq('student_visible',true).order('pinned',{ascending:false}).order('created_at',{ascending:false}).limit(1)
    ]);weak=w.count||0;bookmarks=b.count||0;attempts=(a.count||0)+(p.count||0);visibleSubjects=sv.count||0;info=Array.isArray(ir)?ir:[];latestClass=lc.data?.[0]||null;latestPoster=lp.data?.[0]||null;
  }catch(_){ }
  let resume=null;try{const r=JSON.parse(localStorage.getItem('CBT_FINAL_V16_RESUME_'+user.id)||'null');if(r&&Array.isArray(r.questions)&&r.questions.length&&Number(r.endMs||0)>Date.now())resume=r}catch(_){ }
  const infoHtml=info.length?`<div class="important-info-stack compact-info">${info.slice(0,2).map(x=>`<article class="important-info-card ${x.pinned?'pinned':''}"><h3>${x.pinned?'★ ':''}${esc(x.title||'Important Information')}</h3>${x.message?`<p>${esc(x.message)}</p>`:''}${x.action_url&&x.action_label?`<a href="${esc(x.action_url)}" target="_blank" rel="noopener">${esc(x.action_label)} →</a>`:''}</article>`).join('')}</div>`:'';
  const latest=[];
  if(latestClass)latest.push(`<article class="home-v17-card"><h3>▶ नई Class</h3><p>${esc(latestClass.class_title||latestClass.topic_name||'Haryana GK Class')}${latestClass.part_no?` • Part ${Number(latestClass.part_no)}`:''}</p></article>`);
  if(latestPoster)latest.push(`<article class="home-v17-card"><h3>▧ नया Update</h3><p>${esc(latestPoster.title||latestPoster.message||'नया Poster / Announcement')}</p></article>`);
  if(resume)latest.unshift(`<article class="home-v17-card"><h3>⏱ जहाँ छोड़ा था</h3><p>आपका ${resume.questions.length} प्रश्न वाला CBT अभी जारी है।</p><a class="mini-action" href="cbt-exam-v12-26.html?build=17.0.0">Continue Test →</a></article>`);
  latest.push(`<article class="home-v17-card"><h3>🎯 आज की Revision</h3><p>${weak?`${weak} कमजोर प्रश्न दोहराने के लिए तैयार हैं।`:'अभी कोई active weak question नहीं है।'}</p>${weak?'<a class="mini-action" href="cbt-exam-v12-26.html?mode=weak&build=17.0.0">Revision शुरू करें →</a>':''}</article>`);
  host.innerHTML=`<section class="home-v17-welcome"><h2>Haryana GK की तैयारी — Basic से Advanced तक, Class से Practice तक।</h2><p>हर दिन थोड़ा आगे बढ़िए, हर टेस्ट के बाद अपनी कमजोरी पहचानिए और नियमित Practice से तैयारी मजबूत बनाइए।</p><div class="home-v17-steps"><div class="home-v17-step"><b>सीखें</b><small>Concept समझें</small></div><div class="home-v17-step"><b>Practice करें</b><small>CBT लगाएँ</small></div><div class="home-v17-step"><b>सुधारें</b><small>Weak Questions दोहराएँ</small></div></div><div class="home-v17-quote">“नियमित अभ्यास ही मजबूत तैयारी की असली पहचान है।”</div></section>${infoHtml}<div class="home-v17-section-title"><b>आपकी तैयारी</b><small>एक नजर में</small></div><div class="student-stat-grid compact-stats home-v17-stats"><div><b>${visibleSubjects}</b><span>Live Subjects</span></div><div><b>${attempts}</b><span>Attempts</span></div><div><b>${weak}</b><span>Weak</span></div><div><b>${bookmarks}</b><span>Saved</span></div></div><div class="home-v17-section-title"><b>आज आपके लिए</b><small>Latest & useful</small></div><div class="home-v17-grid">${latest.join('')}</div>`;
}
async function loadRevision(){
  const host=byId('revisionBox');if(!host)return;host.innerHTML='<div class="item">Revision data load हो रहा है…</div>';
  const [w,b,a,p]=await Promise.all([
    sb.from('cbt_student_weak_questions').select('question_key,last_reason,wrong_count,skipped_count,slow_count,mastered,last_seen_at').eq('student_id',user.id).eq('mastered',false).order('last_seen_at',{ascending:false}).limit(50),
    sb.from('cbt_bookmarks').select('question_key,created_at').eq('student_id',user.id).order('created_at',{ascending:false}).limit(50),
    sb.from('cbt_test_attempts').select('id,is_ranked,total_questions,correct_answers,wrong_answers,skipped_questions,percentage,time_taken_seconds,created_at').eq('student_id',user.id).order('created_at',{ascending:false}).limit(20),
    sb.from('cbt_practice_history').select('id,mode,total_questions,correct_answers,wrong_answers,skipped_questions,percentage,time_taken_seconds,created_at').eq('student_id',user.id).order('created_at',{ascending:false}).limit(20)
  ]);
  const weak=w.data||[],marks=b.data||[];
  const history=[...(a.data||[]).map(x=>({...x,history_mode:x.is_ranked?'Official':'Practice'})),...(p.data||[]).map(x=>({...x,history_mode:'Practice'}))].sort((x,y)=>String(y.created_at).localeCompare(String(x.created_at))).slice(0,25);
  const hist=history.map(x=>`<tr><td>${new Date(x.created_at).toLocaleDateString('hi-IN')}</td><td>${x.total_questions}</td><td>${x.correct_answers}</td><td>${x.wrong_answers}</td><td>${Number(x.percentage||0).toFixed(1)}%</td><td>${Math.floor((x.time_taken_seconds||0)/60)}:${String((x.time_taken_seconds||0)%60).padStart(2,'0')}</td><td>${x.history_mode||'Practice'}</td></tr>`).join('');
  host.innerHTML=`<div class="revision-action-grid"><a class="revision-action primary" href="cbt-exam-v12-26.html?mode=weak&build=17.0.0"><b>🎯 कमजोर प्रश्न</b><span>${weak.length} active weak questions</span><small>Wrong + Skipped + Slow questions से revision test</small></a><a class="revision-action" href="cbt-exam-v12-26.html?mode=bookmarks&build=17.0.0"><b>⭐ Bookmarked Questions</b><span>${marks.length} saved</span><small>आपके marked important questions</small></a></div><div class="card" style="margin-top:16px"><h3>Recent Test History</h3><div style="overflow:auto"><table class="data-table"><thead><tr><th>Date</th><th>Q</th><th>Correct</th><th>Wrong</th><th>Accuracy/Score%</th><th>Time</th><th>Mode</th></tr></thead><tbody>${hist||'<tr><td colspan="7">अभी कोई attempt नहीं है।</td></tr>'}</tbody></table></div></div>`;
}
async function renderProfile(){
  const host=byId('profileBox');if(!host)return;let attempts=0,official=0,avg=0,best=0,weak=0,bookmarks=0;
  const [r,p,w,b]=await Promise.all([
    sb.from('cbt_test_attempts').select('percentage,is_ranked').eq('student_id',user.id),
    sb.from('cbt_practice_history').select('percentage').eq('student_id',user.id),
    sb.from('cbt_student_weak_questions').select('question_key',{count:'exact',head:true}).eq('student_id',user.id).eq('mastered',false),
    sb.from('cbt_bookmarks').select('question_key',{count:'exact',head:true}).eq('student_id',user.id)
  ]);
  const ranked=r.data||[],practice=p.data||[],all=[...ranked,...practice];official=ranked.filter(x=>x.is_ranked!==false).length;weak=w.count||0;bookmarks=b.count||0;
  if(all.length){attempts=all.length;avg=all.reduce((sum,x)=>sum+Number(x.percentage||0),0)/attempts;best=Math.max(...all.map(x=>Number(x.percentage||0)))}
  const fullName=profile?.full_name||'Student';const initials=String(fullName).trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()||'S';
  const g=String(profile?.avatar_gender||profile?.gender||'').toLowerCase();const genderLabel=g==='boy'?'लड़का':g==='girl'?'लड़की':'विद्यार्थी';
  host.innerHTML=`<div class="profile-v15-shell"><div class="profile-v15-cover"></div><div class="profile-v15-body"><div class="profile-v15-identity"><div class="profile-v15-initial">${esc(initials)}</div><div class="profile-v15-name"><h2>${esc(fullName)}</h2><p>${esc(user.email||'')}</p><span class="profile-gender-chip">${esc(genderLabel)}</span></div></div><div class="profile-v15-stats"><div><b>${attempts}</b><span>Total Attempts</span></div><div><b>${avg.toFixed(1)}%</b><span>Average</span></div><div><b>${best.toFixed(1)}%</b><span>Best</span></div></div><div class="profile-v15-extra"><div>Official Attempts <b>${official}</b></div><div>Weak Questions <b>${weak}</b></div><div>Bookmarks <b>${bookmarks}</b></div><div>Account <b>Active</b></div></div><div class="profile-v15-actions"><button class="btn btn-light" onclick="sendPasswordReset()">Password Reset Email</button><button class="btn btn-red" onclick="logout()">Logout</button></div></div></div>`;
}
async function sendPasswordReset(){try{const redirectTo=new URL('./s4n8v2k7-r1p6x9m3-c5t8q4z2.html',location.href).href;const r=await sb.auth.resetPasswordForEmail(user.email,{redirectTo});if(r.error)throw r.error;toast('Password Reset Link Email पर भेज दिया गया।','success')}catch(e){toast(e.message||'Reset link नहीं भेजा गया।','error')}}
async function init(){
  user=await requireAuth();if(!user)return;profile=await getProfile(user.id);if(profile?.is_active===false){await sb.auth.signOut();location.href='index.html';return}
  initInstallUI('studentInstallBtn');if(byId('studentNameTop'))byId('studentNameTop').textContent=profile?.full_name||'Student';
  await refreshTabUpdates();setInterval(refreshTabUpdates,60000);
  const wanted=new URLSearchParams(location.search).get('tab');if(STUDENT_TABS.includes(wanted))await tab(wanted);else await tab('home');
}
init();
