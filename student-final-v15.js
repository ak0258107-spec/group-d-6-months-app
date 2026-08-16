let user=null,profile=null,ytRows=[],posterRows=[],importantRows=[],posterObjectUrls=[];
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
async function loadClasses(){
  const host=byId('classesBox');if(!host)return;host.innerHTML='<div class="item">Haryana GK Classes load हो रही हैं…</div>';
  const r=await sb.from('haryana_youtube_classes').select('id,topic_key,topic_name,class_title,part_no,tagline,youtube_url,student_visible,sort_order,created_at,updated_at').eq('student_visible',true).order('sort_order').order('created_at',{ascending:false});
  if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V15 SQL run करें।</small></div>`;return}
  ytRows=r.data||[];
  host.innerHTML=ytRows.map(c=>`<article class="yt-class-card no-thumb"><div class="yt-class-content"><div class="yt-class-meta"><span>${esc(c.topic_name)}</span><b>Part ${Number(c.part_no||1)}</b></div><h3>${esc(c.class_title)}</h3><p>${esc(c.tagline)}</p><a class="btn btn-red full-btn" href="${esc(c.youtube_url)}" target="_blank" rel="noopener">▶ Watch Now</a></div></article>`).join('')||'<div class="item">अभी कोई Haryana GK Class publish नहीं है।</div>';
}
async function posterImageUrl(key){
  if(!key)return '';
  const r=await r2ApiFetch(`/poster?key=${encodeURIComponent(key)}`);if(!r.ok)throw new Error(await r2ErrorMessage(r,'Poster load failed'));
  const u=URL.createObjectURL(await r.blob());posterObjectUrls.push(u);return u;
}
async function loadPosters(){
  const host=byId('posterBox');if(!host)return;host.innerHTML='<div class="item">Posters load हो रहे हैं…</div>';
  posterObjectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});posterObjectUrls=[];
  const r=await sb.from('app_posters').select('*').eq('student_visible',true).order('pinned',{ascending:false}).order('sort_order').order('created_at',{ascending:false});
  if(r.error){host.innerHTML=`<div class="item text-error">${esc(r.error.message)}<br><small>Final V15 SQL run करें।</small></div>`;return}
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
  let weak=0,bookmarks=0,attempts=0,visibleSubjects=0;let info=[];
  try{
    const [w,b,a,p,sv,ir]=await Promise.all([
      sb.from('cbt_student_weak_questions').select('question_key',{count:'exact',head:true}).eq('student_id',user.id).eq('mastered',false),
      sb.from('cbt_bookmarks').select('question_key',{count:'exact',head:true}).eq('student_id',user.id),
      sb.from('cbt_test_attempts').select('id',{count:'exact',head:true}).eq('student_id',user.id),
      sb.from('cbt_practice_history').select('id',{count:'exact',head:true}).eq('student_id',user.id),
      sb.from('cbt_subject_visibility').select('subject_key',{count:'exact',head:true}).eq('student_visible',true),
      loadImportantInformation()
    ]);weak=w.count||0;bookmarks=b.count||0;attempts=(a.count||0)+(p.count||0);visibleSubjects=sv.count||0;info=Array.isArray(ir)?ir:[];
  }catch(_){ }
  const initials=String(profile?.full_name||'S').trim().split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();
  const infoHtml=info.length?`<div class="important-info-stack">${info.map(x=>`<article class="important-info-card ${x.pinned?'pinned':''}"><h3>${x.pinned?'★ ':''}${esc(x.title||'Important Information')}</h3>${x.message?`<p>${esc(x.message)}</p>`:''}${x.action_url&&x.action_label?`<a href="${esc(x.action_url)}" target="_blank" rel="noopener">${esc(x.action_label)} →</a>`:''}</article>`).join('')}</div>`:'';
  host.innerHTML=`<div class="student-final-hero"><div><span class="simple-kicker">PREMIUM PRACTICE HUB</span><h2>नमस्ते, ${esc(profile?.full_name||'Student')}</h2><p>आज की practice शुरू करें, नई classes देखें और अपने कमजोर प्रश्न मजबूत करें।</p></div><button class="btn btn-blue" onclick="tab('cbt')">START CBT</button></div>${infoHtml}<div class="student-stat-grid"><div><b>${visibleSubjects}</b><span>Live Subjects</span></div><div><b>${attempts}</b><span>Total Attempts</span></div><div><b>${weak}</b><span>Weak Questions</span></div><div><b>${bookmarks}</b><span>Bookmarks</span></div></div><div class="student-home-actions"><a href="cbt-exam-v12-26.html?mode=weak&build=15.0.0">आज मेरे कमजोर प्रश्न कराओ<small>Wrong, skipped और slow questions की smart practice</small></a><button onclick="tab('revision')">Revision Center<small>History, weak questions और bookmarks</small></button><button onclick="tab('classes')">Haryana GK Classes<small>नई YouTube classes</small></button><button onclick="tab('poster')">Poster / Announcement<small>नई announcements देखें</small></button></div>`;
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
  host.innerHTML=`<div class="revision-action-grid"><a class="revision-action primary" href="cbt-exam-v12-26.html?mode=weak&build=15.0.0"><b>🎯 कमजोर प्रश्न</b><span>${weak.length} active weak questions</span><small>Wrong + Skipped + Slow questions से revision test</small></a><a class="revision-action" href="cbt-exam-v12-26.html?mode=bookmarks&build=15.0.0"><b>⭐ Bookmarked Questions</b><span>${marks.length} saved</span><small>आपके marked important questions</small></a></div><div class="card" style="margin-top:16px"><h3>Recent Test History</h3><div style="overflow:auto"><table class="data-table"><thead><tr><th>Date</th><th>Q</th><th>Correct</th><th>Wrong</th><th>Accuracy/Score%</th><th>Time</th><th>Mode</th></tr></thead><tbody>${hist||'<tr><td colspan="7">अभी कोई attempt नहीं है।</td></tr>'}</tbody></table></div></div>`;
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
