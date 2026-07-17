let user=null, profile=null;
function tab(name){["home","schedule","tests","progress","messages"].forEach(x=>document.getElementById(x+"Tab").classList.toggle("hidden",x!==name))}
async function init(){
  registerSW();user=await requireAuth();if(!user)return;profile=await getProfile(user.id);
  await Promise.all([loadHome(),loadSchedule(),loadTests(),loadProgress(),loadMessages()]);
}
async function getCurrentDay(){
  const today=new Date().toISOString().slice(0,10);
  let {data}=await sb.from("schedule_days").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).eq("day_date",today).maybeSingle();
  if(data)return data;
  const {data:first}=await sb.from("schedule_days").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).order("day_number").limit(1).maybeSingle();
  return first;
}
async function loadHome(){
  const day=await getCurrentDay();if(!day){homeBox.innerHTML='<div class="card">Schedule नहीं मिला।</div>';return}
  const {data:targets=[]}=await sb.from("daily_targets").select("*").eq("schedule_day_id",day.id).order("target_order");
  const {data:done=[]}=await sb.from("target_completions").select("target_id,is_completed").eq("user_id",user.id);
  const doneSet=new Set(done.filter(x=>x.is_completed).map(x=>x.target_id));
  const {data:materials=[]}=await sb.from("study_materials").select("*").eq("schedule_day_id",day.id).eq("status","published").order("created_at");
  const {data:vqs=[]}=await sb.from("verification_questions").select("*").eq("schedule_day_id",day.id).eq("is_active",true);
  let html=`<div class="grid"><div class="card span-8"><div class="row wrap"><div><h2>Day ${day.day_number} — ${esc(day.phase||"")}</h2><div class="muted">${fmtDate(day.day_date)} • ${esc(day.day_name||"")}</div></div><span class="badge badge-blue">${esc(day.day_kind)}</span></div>`;
  html+=targets.map(t=>`<div class="target"><div class="row wrap"><div><div class="target-title">${esc(t.subject)}</div><div>${esc(t.topic)}</div></div><div>${t.youtube_url?`<a target="_blank" class="btn btn-blue" href="${esc(t.youtube_url)}">Class</a>`:""} <button class="btn ${doneSet.has(t.id)?"btn-green":"btn-light"}" onclick="toggleTarget('${t.id}',${doneSet.has(t.id)})">${doneSet.has(t.id)?"Completed ✓":"Mark Complete"}</button></div></div></div>`).join("");
  html+=`</div><div class="card span-4"><h3>My Snapshot</h3><p><b>${esc(profile?.full_name||"Student")}</b></p><p>Current Streak: ${profile?.current_streak||0}</p><p>Best Streak: ${profile?.best_streak||0}</p><p>Average Test: ${profile?.average_test_percentage||0}%</p></div></div>`;
  if(materials.length){html+=`<div class="card"><h3>Study Materials / PDF</h3><div class="list">${materials.map(m=>`<div class="item material"><div><b>${esc(m.title)}</b><div class="muted small">${Math.round((m.file_size_bytes||0)/1024)} KB</div></div><button class="btn btn-blue" onclick="openMaterial('${m.storage_path}')">Open PDF</button></div>`).join("")}</div></div>`}
  if(vqs.length){html+=`<div class="card"><h3>Verification Questions</h3>${vqs.map(v=>`<div class="item"><b>${esc(v.verification_kind.toUpperCase())}</b><p>${esc(v.question_text)}</p>${v.answer_type==="mcq"&&Array.isArray(v.options)?`<select id="vq_${v.id}"><option value="">उत्तर चुनें</option>${v.options.map(o=>`<option>${esc(o)}</option>`).join("")}</select>`:`<input id="vq_${v.id}" placeholder="उत्तर लिखें">`}<button class="btn btn-green" onclick="verifyAnswer('${v.id}')">Submit Answer</button></div>`).join("")}</div>`}
  homeBox.innerHTML=html;
}
async function toggleTarget(id,isDone){
  if(isDone){await sb.from("target_completions").delete().eq("user_id",user.id).eq("target_id",id)}
  else{await sb.from("target_completions").upsert({user_id:user.id,target_id:id,is_completed:true,completion_source:"app"},{onConflict:"user_id,target_id"})}
  const day=await getCurrentDay();await sb.rpc("refresh_daily_progress",{p_user_id:user.id,p_schedule_day_id:day.id});await loadHome();await loadProgress();await loadMessages();
}
async function verifyAnswer(id){
  const input=document.getElementById("vq_"+id);const answer=input?.value||"";if(!answer){toast("उत्तर भरें","error");return}
  const {data,error}=await sb.rpc("submit_verification_answer",{p_verification_question_id:id,p_answer:answer});
  if(error){toast(error.message,"error");return}toast(data?"सही उत्तर ✓":"उत्तर सही नहीं है",data?"success":"error");
  const day=await getCurrentDay();await sb.rpc("refresh_daily_progress",{p_user_id:user.id,p_schedule_day_id:day.id});loadProgress();loadMessages();
}
async function openMaterial(path){
  const {data,error}=await sb.storage.from("study-pdfs").createSignedUrl(path,60*10);
  if(error){toast(error.message,"error");return}window.open(data.signedUrl,"_blank");
}
async function loadSchedule(){
  const {data:days=[]}=await sb.from("schedule_days").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).order("day_number");
  const {data:targets=[]}=await sb.from("daily_targets").select("schedule_day_id,subject,topic,target_order").order("target_order");
  const g={};targets.forEach(t=>(g[t.schedule_day_id]??=[]).push(t));
  scheduleList.innerHTML=days.map(d=>`<div class="card day-card"><div class="row wrap"><div><b>Day ${d.day_number}</b> — ${fmtDate(d.day_date)}</div><span class="badge badge-blue">${esc(d.phase||"")}</span></div>${(g[d.id]||[]).map(t=>`<div class="target"><b>${esc(t.subject)}:</b> ${esc(t.topic)}</div>`).join("")}</div>`).join("");
}
async function loadTests(){
  const now=new Date().toISOString();
  const {data:tests=[]}=await sb.from("tests").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).eq("status","published").order("created_at",{ascending:false});
  testsList.innerHTML=tests.length?tests.map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title)}</b><div class="muted">${t.total_questions} Questions • ${t.time_limit_minutes||"No timer"} min • ${esc(t.test_type)}</div></div><a class="btn btn-green" href="test.html?id=${t.id}">Start Test</a></div></div>`).join(""):"<div class='card'>अभी कोई Published Test नहीं है।</div>";
}
async function loadProgress(){
  const {data:rows=[]}=await sb.from("daily_progress").select("*,schedule_days(day_number,day_date)").eq("user_id",user.id).order("updated_at",{ascending:false});
  const completed=rows.filter(x=>x.status==="completed").length, partial=rows.filter(x=>x.status==="partial").length;
  const pct=rows.length?Math.round(completed/rows.length*100):0;
  progressBox.innerHTML=`<div class="grid"><div class="card span-4"><div class="muted">Completed Days</div><div class="kpi">${completed}</div></div><div class="card span-4"><div class="muted">Partial Days</div><div class="kpi">${partial}</div></div><div class="card span-4"><div class="muted">Completion</div><div class="kpi">${pct}%</div></div></div><div class="card"><div class="progressbar"><span style="width:${pct}%"></span></div></div><div class="list">${rows.map(r=>`<div class="item"><div class="row wrap"><div>Day ${r.schedule_days?.day_number||"-"} — ${r.schedule_days?.day_date?fmtDate(r.schedule_days.day_date):""}</div><span class="badge ${r.status==="completed"?"badge-green":r.status==="partial"?"badge-orange":"badge-gray"}">${esc(r.status)}</span></div><div class="muted">Targets ${r.completed_targets}/${r.total_targets} • Test ${r.test_score_percent??"-"}%</div></div>`).join("")}</div>`;
}
async function loadMessages(){
  const {data:msgs=[]}=await sb.from("student_messages").select("*,message_templates(*)").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);
  messagesList.innerHTML=msgs.length?msgs.map(m=>`<div class="item"><b>${esc(m.message_templates?.title||m.template_code)} ${esc(m.message_templates?.emoji||"")}</b><p>${esc(m.message_templates?.message_text||"")}</p><div class="muted small">${new Date(m.created_at).toLocaleString("hi-IN")}</div></div>`).join(""):"<div class='card'>अभी कोई Message नहीं है।</div>";
}
init();
