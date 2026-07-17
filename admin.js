let adminUser=null, dayCache=[], studentCache=[];
function tab(name,el){["dashboard","schedule","students","tests","pdfs","verification","messages"].forEach(x=>document.getElementById(x+"Tab").classList.toggle("hidden",x!==name));document.querySelectorAll(".sidebar a").forEach(a=>a.classList.remove("active"));if(el)el.classList.add("active")}
async function guard(){adminUser=await requireAuth();if(!adminUser)return false;const p=await getProfile(adminUser.id);if(p?.role!=="admin"){alert("Admin access required");location.href="student.html";return false}return true}
async function init(){if(!(await guard()))return;await Promise.all([loadDashboard(),loadSchedule(),loadStudents(),loadTests(),loadDays(),loadMaterials(),loadTemplates()])}
async function loadDashboard(){
  const [{count:students},{count:tests},{count:days},{count:materials}]=await Promise.all([
    sb.from("profiles").select("*",{count:"exact",head:true}).eq("role","student"),
    sb.from("tests").select("*",{count:"exact",head:true}),
    sb.from("schedule_days").select("*",{count:"exact",head:true}).eq("batch_id",APP_CONFIG.BATCH_ID),
    sb.from("study_materials").select("*",{count:"exact",head:true})
  ]);
  kpis.innerHTML=`<div class="card span-3"><div class="muted">Students</div><div class="kpi">${students||0}</div></div><div class="card span-3"><div class="muted">Tests</div><div class="kpi">${tests||0}</div></div><div class="card span-3"><div class="muted">Schedule Days</div><div class="kpi">${days||0}</div></div><div class="card span-3"><div class="muted">PDFs</div><div class="kpi">${materials||0}</div></div>`;
  const today=new Date().toISOString().slice(0,10);const day=await sb.from("schedule_days").select("id,day_number").eq("day_date",today).maybeSingle();
  if(day.data){const {data:p=[]}=await sb.from("daily_progress").select("status,test_score_percent").eq("schedule_day_id",day.data.id);const c=p.filter(x=>x.status==="completed").length,partial=p.filter(x=>x.status==="partial").length,not=p.filter(x=>x.status==="not_started").length;todayStats.innerHTML=`<h3>Today — Day ${day.data.day_number}</h3><div class="row wrap"><span class="badge badge-green">Completed ${c}</span><span class="badge badge-orange">Partial ${partial}</span><span class="badge badge-gray">Not Started ${not}</span></div>`}else todayStats.innerHTML="<h3>Today</h3><p class='muted'>Batch schedule का आज कोई day नहीं है।</p>";
}
async function loadSchedule(){
  const {data:days=[]}=await sb.from("schedule_days").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).order("day_number");dayCache=days;
  const {data:targets=[]}=await sb.from("daily_targets").select("*").order("target_order");const g={};targets.forEach(t=>(g[t.schedule_day_id]??=[]).push(t));
  adminSchedule.innerHTML=days.map(d=>`<div class="card day-card"><div class="row wrap"><b>Day ${d.day_number} — ${fmtDate(d.day_date)}</b><span class="badge badge-blue">${esc(d.phase||"")}</span></div>${(g[d.id]||[]).map(t=>`<div class="target"><b>${esc(t.subject)}:</b> ${esc(t.topic)}</div>`).join("")}</div>`).join("");
}
async function loadStudents(){
  const {data:students=[]}=await sb.from("profiles").select("*").eq("role","student").order("created_at",{ascending:false});studentCache=students;
  const today=new Date().toISOString().slice(0,10);const {data:day}=await sb.from("schedule_days").select("id").eq("day_date",today).maybeSingle();
  let prog=[];if(day){const r=await sb.from("daily_progress").select("*").eq("schedule_day_id",day.id);prog=r.data||[]}
  const pm={};prog.forEach(p=>pm[p.user_id]=p);
  studentsBody.innerHTML=students.map(s=>`<tr><td>${esc(s.full_name||"")}</td><td>${esc(s.phone||"")}</td><td>${s.total_completed_days||0}</td><td>${s.average_test_percentage||0}%</td><td>${s.current_streak||0}</td><td><span class="badge ${pm[s.id]?.status==="completed"?"badge-green":pm[s.id]?.status==="partial"?"badge-orange":"badge-gray"}">${esc(pm[s.id]?.status||"not_started")}</span></td></tr>`).join("");
  messageStudent.innerHTML=students.map(s=>`<option value="${s.id}">${esc(s.full_name||s.id)}</option>`).join("");
}
async function loadTests(){const {data=[]}=await sb.from("tests").select("*").eq("batch_id",APP_CONFIG.BATCH_ID).order("created_at",{ascending:false});adminTests.innerHTML=data.map(t=>`<div class="item"><div class="row wrap"><div><b>${esc(t.title)}</b><div class="muted">${t.total_questions} Questions • ${t.time_limit_minutes||"-"} min</div></div><span class="badge ${t.status==="published"?"badge-green":"badge-gray"}">${esc(t.status)}</span></div></div>`).join("")}
async function loadDays(){
  if(!dayCache.length){const r=await sb.from("schedule_days").select("id,day_number,day_date").eq("batch_id",APP_CONFIG.BATCH_ID).order("day_number");dayCache=r.data||[]}
  const opts=dayCache.map(d=>`<option value="${d.id}">Day ${d.day_number} — ${fmtDate(d.day_date)}</option>`).join("");
  pdfDay.innerHTML=opts;verifyDay.innerHTML=opts;testDay.innerHTML='<option value="">No linked day</option>'+opts;
}
async function createTest(){
  let qs;try{qs=JSON.parse(questionsJson.value)}catch{toast("Questions JSON invalid","error");return}
  if(!Array.isArray(qs)||!qs.length){toast("कम से कम 1 question डालें","error");return}
  const allowed=new Set(["normal_mcq","multi_statement","statement_conclusion","assertion_reason","matching","chronology","fill_blank","correct_code","odd_one_out","multiple_statement_correctness"]);
  for(const q of qs){if(!allowed.has(q.question_type)){toast("Invalid question_type: "+q.question_type,"error");return}if(!Array.isArray(q.options)||q.options.length!==4){toast("हर question में 4 options जरूरी हैं","error");return}if(q.correct_answer===undefined){toast("हर question में correct_answer जरूरी है","error");return}}
  const {data:t,error}=await sb.from("tests").insert({batch_id:APP_CONFIG.BATCH_ID,schedule_day_id:testDay.value||null,title:testName.value.trim(),test_type:testType.value,total_questions:qs.length,total_marks:qs.reduce((a,q)=>a+(q.marks||1),0),time_limit_minutes:+testTime.value||null,status:"published",created_by:adminUser.id}).select().single();
  if(error){toast(error.message,"error");return}
  for(let i=0;i<qs.length;i++){const q=qs[i];const {data:row,error:qe}=await sb.from("test_questions").insert({test_id:t.id,question_order:i+1,marks:q.marks||1,difficulty:q.difficulty||"normal",question_type:q.question_type,question_text:q.question_text,instructions:q.instructions||null,options:q.options,statements:q.statements||null,assertion_text:q.assertion_text||null,reason_text:q.reason_text||null,list_a:q.list_a||null,list_b:q.list_b||null,sequence_items:q.sequence_items||null,blank_text:q.blank_text||null,subject:q.subject||null,topic:q.topic||null}).select().single();if(qe){toast("Q"+(i+1)+": "+qe.message,"error");return}const key=await sb.from("test_question_keys").insert({question_id:row.id,correct_answer:q.correct_answer,explanation:q.explanation||null});if(key.error){toast(key.error.message,"error");return}}
  toast("Test publish हो गया","success");testName.value="";questionsJson.value="";loadTests();loadDashboard();
}
async function uploadPdf(){
  const f=pdfFile.files[0];if(!f){toast("PDF चुनें","error");return}if(f.size>25*1024*1024){toast("PDF 25 MB से बड़ी है","error");return}
  const path=`${pdfDay.value}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
  const up=await sb.storage.from("study-pdfs").upload(path,f,{contentType:"application/pdf"});if(up.error){toast(up.error.message,"error");return}
  const ins=await sb.from("study_materials").insert({schedule_day_id:pdfDay.value,title:pdfTitle.value.trim()||f.name,material_type:"pdf",storage_path:path,file_size_bytes:f.size,mime_type:"application/pdf",status:"published",uploaded_by:adminUser.id,published_at:new Date().toISOString()});
  if(ins.error){toast(ins.error.message,"error");return}toast("PDF upload हो गई","success");pdfTitle.value="";pdfFile.value="";loadMaterials();loadDashboard();
}
async function loadMaterials(){const {data=[]}=await sb.from("study_materials").select("*,schedule_days(day_number)").order("created_at",{ascending:false});materialsList.innerHTML=data.map(m=>`<div class="item"><b>${esc(m.title)}</b><div class="muted">Day ${m.schedule_days?.day_number||"-"} • ${Math.round((m.file_size_bytes||0)/1024)} KB</div></div>`).join("")}
async function createVerification(){
  if(!verifyQuestion.value.trim()||!verifyAnswer.value.trim()){toast("Question और Answer दोनों भरें","error");return}
  const {data:q,error}=await sb.from("verification_questions").insert({schedule_day_id:verifyDay.value,verification_kind:verifyKind.value,question_text:verifyQuestion.value.trim(),answer_type:"text",is_active:true}).select().single();if(error){toast(error.message,"error");return}
  const key=await sb.from("verification_answer_keys").insert({verification_question_id:q.id,correct_answer:verifyAnswer.value.trim()});if(key.error){toast(key.error.message,"error");return}
  toast("Verification question save हो गया","success");verifyQuestion.value="";verifyAnswer.value="";
}
async function loadTemplates(){const {data=[]}=await sb.from("message_templates").select("*");messageTemplate.innerHTML=data.map(x=>`<option value="${x.code}">${esc(x.title)} ${esc(x.emoji||"")}</option>`).join("");templatesList.innerHTML=data.map(x=>`<div class="item"><b>${esc(x.title)} ${esc(x.emoji||"")}</b><p>${esc(x.message_text)}</p></div>`).join("")}
async function sendFixedMessage(){if(!messageStudent.value||!messageTemplate.value){toast("Student और Message चुनें","error");return}const {error}=await sb.from("student_messages").insert({user_id:messageStudent.value,template_code:messageTemplate.value,source:"admin"});if(error){toast(error.message,"error");return}toast("Fixed message भेज दिया","success")}
init();
