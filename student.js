/* GK BY PURUSHOTAM SIR — V12.20 SIMPLE STUDENT APP */
let user=null,profile=null,classes=[],materials=[],announcements=[],notificationRows=[],posterRows=[],fiveDayTargets=[];
let posterUrls=[],posterTimer=null,currentPoster=0;
const STUDENT_TABS=['home','targets','classes','classpdfs','otherpdfs','cbt','announcements','notifications','profile'];
function byId(id){return document.getElementById(id)}
function localDateKey(date=new Date()){const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');return `${y}-${m}-${d}`}
function tab(name,el){
  STUDENT_TABS.forEach(x=>byId(x+'Tab')?.classList.toggle('hidden',x!==name));
  document.querySelectorAll('.simple-student-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
  if(el)el.classList.add('active');
  if(name==='notifications')markAllNotificationsRead();
  window.scrollTo({top:0,behavior:'smooth'});
}
function statusLabel(status){return ({scheduled:'Scheduled',live:'Live Now',completed:'Completed / Recording',cancelled:'Cancelled',time_changed:'Time Changed',partial:'Time Changed'})[status]||status||'Scheduled'}
function classDateTime(row){
  const date=row.day_date||row.schedule_days?.day_date||'';
  const time=String(row.start_time||'').slice(0,5);
  if(!time)return {date,time:'Time not set',sort:`${date}T23:59`};
  const [h,m]=time.split(':').map(Number),dt=new Date();dt.setHours(h,m,0,0);
  return {date,time:dt.toLocaleTimeString('hi-IN',{hour:'numeric',minute:'2-digit'}),sort:`${date}T${time}:00`};
}
function effectiveClassStatus(row){
  const raw=row.class_status||'scheduled';if(['cancelled','live','time_changed','partial'].includes(raw))return raw;
  const {date,sort}=classDateTime(row),now=new Date(),start=new Date(sort),duration=Math.max(1,Number(row.duration_minutes||60)),end=new Date(start.getTime()+duration*60000);
  if(date&&now>=start&&now<=end&&row.class_type!=='recorded')return 'live';
  if(date&&now>end)return 'completed';
  return raw;
}
function classBadge(status){return status==='live'?'badge-red':status==='completed'?'badge-green':status==='cancelled'?'badge-gray':status==='time_changed'||status==='partial'?'badge-orange':'badge-blue'}

async function init(){
  user=await requireAuth();if(!user)return;
  profile=await getProfile(user.id);
  if(String(profile?.role||'student').toLowerCase()==='admin'){location.href='q9v3x7k2-r8m4p6t1-z5n7c2w9.html';return}
  if(profile?.is_active===false){await sb.auth.signOut();alert('आपका Student account Admin ने अभी Inactive किया हुआ है।');location.href='index.html';return}
  registerSW();initInstallUI('studentInstallBtn');initPushNotifications();
  await Promise.all([loadFiveDayTargets(),loadClasses(),loadMaterials(),loadAnnouncements(),loadNotifications(),loadPosters()]);
  renderProfile();renderHome();
  const requested=new URLSearchParams(location.search).get('tab');if(STUDENT_TABS.includes(requested))tab(requested);else tab('home');
  setInterval(()=>{renderClasses();renderHome()},60000);
  setInterval(()=>{if(document.visibilityState==='visible')loadNotifications()},30000);
}

async function loadFiveDayTargets(){
  const host=byId('targetsBox');
  const r=await sb.rpc('student_list_first_five_targets');
  if(r.error){console.warn(r.error);fiveDayTargets=[];if(host)host.innerHTML=`<div class="student-empty">5-Day Target load नहीं हुआ: ${esc(r.error.message)}</div>`;return}
  fiveDayTargets=r.data||[];renderFiveDayTargets();
}
function groupFiveDayTargets(){
  const map=new Map();
  fiveDayTargets.forEach(row=>{
    const key=String(row.day_number||'');
    if(!map.has(key))map.set(key,{day_number:row.day_number,day_date:row.day_date,items:[]});
    if(row.target_id)map.get(key).items.push(row);
  });
  return [...map.values()].sort((a,b)=>Number(a.day_number)-Number(b.day_number));
}
function renderFiveDayTargets(){
  const host=byId('targetsBox');if(!host)return;
  const days=groupFiveDayTargets();
  host.innerHTML=days.map(day=>`<article class="five-day-card"><div class="five-day-head"><span>DAY ${Number(day.day_number||0)}</span><b>${esc(fmtDate(day.day_date||''))}</b></div>${day.items.length?day.items.map(item=>`<div class="five-day-item"><div><b>${esc(item.subject||'Target')}</b><span>${esc(item.topic||item.class_title||'')}</span></div>${item.youtube_url?`<a class="btn btn-blue btn-mini" href="${esc(item.youtube_url)}" target="_blank" rel="noopener">Class</a>`:''}</div>`).join(''):'<div class="student-empty compact">इस Day का content अभी नहीं जोड़ा गया है।</div>'}</article>`).join('')||'<div class="student-empty">पहले 5 दिनों का Target अभी उपलब्ध नहीं है।</div>';
}

async function loadClasses(){
  const r=await sb.rpc('student_list_simple_classes');
  if(r.error){console.warn(r.error);classes=[];byId('classesBox').innerHTML=`<div class="student-empty">Classes load नहीं हुईं: ${esc(r.error.message)}</div>`;return}
  classes=(r.data||[]).sort((a,b)=>String(classDateTime(a).sort).localeCompare(String(classDateTime(b).sort)));
  renderClasses();if(materials.length)renderPdfs();
}
function renderClasses(){
  const host=byId('classesBox');if(!host)return;
  host.innerHTML=classes.map(x=>{
    const state=effectiveClassStatus(x),dt=classDateTime(x),canWatch=!!x.youtube_url&&state!=='cancelled';
    const button=canWatch?`<a class="btn ${state==='live'?'btn-red':'btn-blue'}" href="${esc(x.youtube_url)}" target="_blank" rel="noopener">${state==='live'?'🔴 Join Live Class':state==='completed'||x.class_type==='recorded'?'Watch Recording':'Watch Class'}</a>`:`<button class="btn btn-light" disabled>${state==='cancelled'?'Class Cancelled':'Link अभी उपलब्ध नहीं'}</button>`;
    return `<article class="student-content-card"><div class="student-card-head"><span class="badge ${classBadge(state)}">${esc(statusLabel(state))}</span><span class="student-card-date">${esc(fmtDate(dt.date))}</span></div><h2>${esc(x.class_title||x.topic||'Class')}</h2><p class="student-card-sub">${esc(x.subject||'')} • ${esc(x.topic||'')}</p><div class="student-meta-row"><span>⏰ ${esc(dt.time)}</span><span>⏳ ${Number(x.duration_minutes||60)} मिनट</span><span>${x.class_type==='recorded'?'🎬 Recorded':'🔴 Live Class'}</span></div>${x.class_note?`<div class="student-note">${esc(x.class_note)}</div>`:''}<div class="student-card-actions">${button}</div></article>`;
  }).join('')||'<div class="student-empty">अभी कोई Class उपलब्ध नहीं है।</div>';
}

async function loadMaterials(){
  const r=await sb.from('study_materials').select('id,title,category,pdf_type,storage_path,access_mode,created_at,target_id').eq('status','published').eq('student_visible',true).order('created_at',{ascending:false});
  if(r.error){console.warn(r.error);materials=[];byId('classPdfsBox').innerHTML=byId('otherPdfsBox').innerHTML=`<div class="student-empty">PDF load नहीं हुईं: ${esc(r.error.message)}</div>`;return}
  materials=r.data||[];renderPdfs();
}
function pdfCard(m){
  const isDownload=m.access_mode==='direct_download';
  return `<article class="student-content-card pdf-card"><div class="student-card-head"><span class="badge badge-blue">PDF</span><span class="student-card-date">${m.created_at?new Date(m.created_at).toLocaleDateString('hi-IN'):''}</span></div><h2>${esc(m.title||'PDF')}</h2><p class="student-card-sub">${esc((m.pdf_type||'class')==='class'?((classes.find(c=>String(c.id)===String(m.target_id))||{}).class_title||(classes.find(c=>String(c.id)===String(m.target_id))||{}).topic||'Class PDF'):(m.category||'Other PDF'))}</p><div class="student-card-actions"><button class="btn btn-blue" onclick='readPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.title||"PDF")})'>Open PDF</button>${isDownload?`<button class="btn btn-green" onclick='downloadPdf(${JSON.stringify(m.id)},${JSON.stringify(m.storage_path||"")},${JSON.stringify(m.title||"PDF")})'>Download</button>`:''}</div></article>`;
}
function renderPdfs(){
  byId('classPdfsBox').innerHTML=materials.filter(x=>(x.pdf_type||'class')==='class').map(pdfCard).join('')||'<div class="student-empty">अभी कोई Class PDF उपलब्ध नहीं है।</div>';
  byId('otherPdfsBox').innerHTML=materials.filter(x=>x.pdf_type==='direct').map(pdfCard).join('')||'<div class="student-empty">अभी कोई Other PDF उपलब्ध नहीं है।</div>';
}
async function openBlobResponse(response,title,download=false){
  if(!response.ok)throw new Error(await r2ErrorMessage(response,download?'PDF download नहीं हुई।':'PDF open नहीं हुई।'));
  const blob=await response.blob(),url=URL.createObjectURL(blob);
  if(download){const a=document.createElement('a');a.href=url;a.download=(title||'study-material').replace(/[\\/:*?"<>|]+/g,'-')+'.pdf';document.body.appendChild(a);a.click();a.remove()}else{const w=window.open(url,'_blank');if(!w)location.href=url}
  setTimeout(()=>URL.revokeObjectURL(url),300000);
}
async function readPdf(id,path,title){
  try{if(isR2PdfPath(path)){await openBlobResponse(await r2ApiFetch(`/material/${encodeURIComponent(id)}/read`),title,false);return}const r=await sb.storage.from('study-pdfs').createSignedUrl(path,300);if(r.error)throw r.error;window.open(r.data.signedUrl,'_blank')}
  catch(e){toast(e.message||'PDF open नहीं हुई।','error')}
}
async function downloadPdf(id,path,title){
  try{if(isR2PdfPath(path)){await openBlobResponse(await r2ApiFetch(`/material/${encodeURIComponent(id)}/download`),title,true);return}const ok=await sb.rpc('can_download_material',{p_material_id:id});if(ok.error)throw ok.error;if(!ok.data)throw new Error('Admin ने Download बंद किया हुआ है।');const r=await sb.storage.from('study-pdfs').createSignedUrl(path,300);if(r.error)throw r.error;const a=document.createElement('a');a.href=r.data.signedUrl;a.download=(title||'PDF')+'.pdf';a.click()}
  catch(e){toast(e.message||'PDF download नहीं हुई।','error')}
}

async function loadAnnouncements(){
  const r=await sb.from('broadcast_messages').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(100);
  announcements=r.data||[];renderAnnouncements();
}
function renderAnnouncements(){
  byId('announcementsBox').innerHTML=announcements.map(x=>`<article class="student-content-card announcement ${esc(x.message_type||'info')}"><div class="student-card-head"><span class="badge badge-blue">${esc(x.message_type||'Notice')}</span><span class="student-card-date">${x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):''}</span></div><h2>${esc(x.title)}</h2><p>${esc(x.message)}</p></article>`).join('')||'<div class="student-empty">अभी कोई Announcement नहीं है।</div>';
}

async function loadNotifications(){
  const [b,a,br,ar]=await Promise.all([
    sb.from('broadcast_messages').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(50),
    sb.from('app_notifications').select('*').eq('is_active',true).order('created_at',{ascending:false}).limit(50),
    sb.from('student_notification_reads').select('broadcast_id').eq('student_id',user.id),
    sb.from('student_app_notification_reads').select('notification_id').eq('student_id',user.id)
  ]);
  const bRead=new Set((br.data||[]).map(x=>String(x.broadcast_id))),aRead=new Set((ar.data||[]).map(x=>String(x.notification_id)));
  const bs=(b.data||[]).map(x=>({id:'b'+x.id,rawId:x.id,isBroadcast:true,title:x.title,message:x.message,type:x.message_type||'info',created_at:x.created_at,unread:!bRead.has(String(x.id))}));
  const as=(a.data||[]).filter(x=>x.related_type!=='broadcast').map(x=>({id:'a'+x.id,rawId:x.id,isBroadcast:false,title:x.title,message:x.message,type:x.related_type||x.notification_type||'info',created_at:x.created_at,unread:!aRead.has(String(x.id))}));
  notificationRows=[...bs,...as].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at));renderNotifications();
}
function renderNotifications(){
  const unread=notificationRows.filter(x=>x.unread).length,b=byId('notificationBadge');b.textContent=unread;b.classList.toggle('hidden',!unread);
  byId('notificationsList').innerHTML=notificationRows.map(x=>`<article class="student-content-card ${x.unread?'notification-unread':''}"><div class="student-card-head"><span class="badge ${x.unread?'badge-red':'badge-blue'}">${x.unread?'NEW':esc(x.type)}</span><span class="student-card-date">${x.created_at?new Date(x.created_at).toLocaleString('hi-IN'):''}</span></div><h2>${esc(x.title)}</h2><p>${esc(x.message)}</p></article>`).join('')||'<div class="student-empty">अभी कोई Notification नहीं है।</div>';
}
async function openNotifications(){if(typeof Notification!=='undefined'&&Notification.permission==='default')enablePushNotifications();tab('notifications');await markAllNotificationsRead()}
async function markAllNotificationsRead(){
  if(!user?.id)return;
  const bRows=notificationRows.filter(x=>x.unread&&x.isBroadcast).map(x=>({student_id:user.id,broadcast_id:x.rawId})),aRows=notificationRows.filter(x=>x.unread&&!x.isBroadcast).map(x=>({student_id:user.id,notification_id:x.rawId}));
  try{if(bRows.length)await sb.from('student_notification_reads').upsert(bRows,{onConflict:'student_id,broadcast_id'});if(aRows.length)await sb.from('student_app_notification_reads').upsert(aRows,{onConflict:'student_id,notification_id'});await loadNotifications()}catch(e){console.warn(e)}
}

function clearPosters(){posterUrls.forEach(URL.revokeObjectURL);posterUrls=[];if(posterTimer)clearInterval(posterTimer)}
async function loadPosters(){
  clearPosters();const now=new Date().toISOString();const r=await sb.from('app_posters').select('*').eq('is_active',true).order('sort_order').order('created_at',{ascending:false});
  posterRows=(r.data||[]).filter(p=>(!p.start_at||p.start_at<=now)&&(!p.end_at||p.end_at>=now));
  const cards=[];for(const p of posterRows){try{const res=await r2ApiFetch(`/poster?key=${encodeURIComponent(p.image_key)}`);if(!res.ok)continue;const url=URL.createObjectURL(await res.blob());posterUrls.push(url);cards.push({...p,url})}catch(e){console.warn(e)}}posterRows=cards;renderPosters();
}
function renderPosters(){
  const section=byId('homePosterSection'),slider=byId('homePosterSlider'),dots=byId('homePosterDots');
  if(!posterRows.length){section.classList.add('hidden');return}section.classList.remove('hidden');slider.innerHTML=posterRows.map((p,i)=>`<article class="simple-poster-slide ${i===0?'active':''}" onclick="openPosterLink(${i})"><img src="${p.url}" alt="${esc(p.title||'Poster')}"><div>${esc(p.title||'')}</div></article>`).join('');dots.innerHTML=posterRows.map((_,i)=>`<button class="${i===0?'active':''}" onclick="showPoster(${i});event.stopPropagation()"></button>`).join('');currentPoster=0;if(posterRows.length>1)posterTimer=setInterval(()=>showPoster((currentPoster+1)%posterRows.length),5000);
}
function showPoster(i){currentPoster=i;document.querySelectorAll('.simple-poster-slide').forEach((el,n)=>el.classList.toggle('active',n===i));byId('homePosterDots').querySelectorAll('button').forEach((el,n)=>el.classList.toggle('active',n===i))}
function openPosterLink(i){const p=posterRows[i];if(p?.click_url)window.open(p.click_url,'_blank','noopener')}

function renderHome(){
  const now=new Date();const upcoming=classes.filter(x=>effectiveClassStatus(x)!=='cancelled'&&new Date(classDateTime(x).sort)>=new Date(now.getTime()-3*3600000)).slice(0,3);
  const latestPdfs=materials.slice(0,4),latestMessage=announcements[0];
  byId('homeBox').innerHTML=`
    ${latestMessage?`<div class="home-important-message"><b>📣 ${esc(latestMessage.title)}</b><p>${esc(latestMessage.message)}</p><button class="btn btn-light btn-mini" onclick="tab('announcements')">सभी संदेश देखें</button></div>`:''}
    <div class="home-quick-grid"><button onclick="tab('targets')"><span>🎯</span><b>5-Day Target</b><small>${groupFiveDayTargets().length} Days</small></button><button onclick="tab('classes')"><span>▶</span><b>Classes</b><small>${classes.length} available</small></button><button onclick="tab('classpdfs')"><span>📘</span><b>Class PDFs</b><small>${materials.filter(x=>(x.pdf_type||'class')==='class').length} PDFs</small></button><button onclick="tab('otherpdfs')"><span>📄</span><b>Other PDFs</b><small>${materials.filter(x=>x.pdf_type==='direct').length} PDFs</small></button><button onclick="tab('cbt')"><span>🖥</span><b>CBT Tests</b><small>Start Test</small></button></div>
    <div class="home-block"><div class="home-block-head"><h2>पहले 5 दिनों का Target</h2><button onclick="tab('targets')">View All</button></div>${groupFiveDayTargets().slice(0,5).map(day=>`<div class="home-row"><div><b>Day ${Number(day.day_number||0)}</b><small>${esc(fmtDate(day.day_date||''))} • ${day.items.length} Target</small></div><span class="badge badge-green">Available</span></div>`).join('')||'<div class="student-empty compact">Target अभी उपलब्ध नहीं है।</div>'}</div>
    <div class="home-block"><div class="home-block-head"><h2>आने वाली Classes</h2><button onclick="tab('classes')">View All</button></div>${upcoming.length?upcoming.map(x=>{const s=effectiveClassStatus(x),dt=classDateTime(x);return `<div class="home-row"><div><b>${esc(x.class_title||x.topic)}</b><small>${esc(fmtDate(dt.date))} • ${esc(dt.time)}</small></div><span class="badge ${classBadge(s)}">${esc(statusLabel(s))}</span></div>`}).join(''):'<div class="student-empty compact">अभी कोई upcoming Class नहीं है।</div>'}</div>
    <div class="home-block"><div class="home-block-head"><h2>नई PDFs</h2></div>${latestPdfs.length?latestPdfs.map(x=>`<div class="home-row"><div><b>${esc(x.title)}</b><small>${(x.pdf_type||'class')==='class'?'Class PDF':'Other PDF'}</small></div><button class="btn btn-blue btn-mini" onclick='readPdf(${JSON.stringify(x.id)},${JSON.stringify(x.storage_path||"")},${JSON.stringify(x.title||"PDF")})'>Open</button></div>`).join(''):'<div class="student-empty compact">अभी कोई PDF नहीं है।</div>'}</div>`;
}

function renderProfile(){
  const name=profile?.full_name||user?.user_metadata?.full_name||user?.email?.split('@')[0]||'Student';
  byId('profileBox').innerHTML=`<div class="simple-profile-card"><div class="simple-profile-avatar">${esc(name.slice(0,1).toUpperCase())}</div><h2>${esc(name)}</h2><p>${esc(user?.email||'')}</p><p>${esc(profile?.phone||'Mobile not added')}</p><div class="profile-simple-actions"><button class="btn btn-blue" onclick="sendPasswordReset()">Reset Password</button><button class="btn btn-purple" onclick="enablePushNotifications()">Enable Notifications</button><button class="btn btn-red" onclick="logout()">Logout</button></div></div>`;
}
async function sendPasswordReset(){try{const redirectTo=new URL('./s4n8v2k7-r1p6x9m3-c5t8q4z2.html',location.href).href;const r=await sb.auth.resetPasswordForEmail(user.email,{redirectTo});if(r.error)throw r.error;toast('Password Reset Link Email पर भेज दिया गया।','success')}catch(e){toast(e.message||'Reset link नहीं भेजा गया।','error')}}

init();
