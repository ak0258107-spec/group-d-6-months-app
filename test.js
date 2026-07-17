let user,test,questions=[],attempt=null,idx=0,answers={},statuses={},timerId=null,secondsLeft=0;
const testId=new URLSearchParams(location.search).get("id");
function renderStructured(q){
  let h="";
  if(q.instructions)h+=`<p class="muted">${esc(q.instructions)}</p>`;
  if(Array.isArray(q.statements)&&q.statements.length)h+=`<ol>${q.statements.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`;
  if(q.assertion_text)h+=`<p><b>अभिकथन:</b> ${esc(q.assertion_text)}</p>`;
  if(q.reason_text)h+=`<p><b>कारण:</b> ${esc(q.reason_text)}</p>`;
  if(Array.isArray(q.list_a)||Array.isArray(q.list_b))h+=`<div class="grid"><div class="span-6"><b>सूची-I</b><ol>${(q.list_a||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div><div class="span-6"><b>सूची-II</b><ol>${(q.list_b||[]).map(x=>`<li>${esc(x)}</li>`).join("")}</ol></div></div>`;
  if(Array.isArray(q.sequence_items)&&q.sequence_items.length)h+=`<ol>${q.sequence_items.map(x=>`<li>${esc(x)}</li>`).join("")}</ol>`;
  return h;
}
function renderQuestion(){
  const q=questions[idx];if(!q)return;
  const opts=Array.isArray(q.options)?q.options:[];
  let h=`<div class="row wrap"><span class="badge badge-blue">Q ${idx+1}/${questions.length}</span><span class="badge badge-gray">${esc(q.question_type)}</span></div><h2>${esc(q.question_text)}</h2>${renderStructured(q)}`;
  h+=opts.map((o,i)=>`<button class="option ${answers[q.id]===i?"selected":""}" onclick="selectOption(${i})"><b>${String.fromCharCode(65+i)}.</b> ${esc(typeof o==="string"?o:(o.text||JSON.stringify(o)))}</button>`).join("");
  questionBox.innerHTML=h;renderPalette();
}
async function selectOption(i){
  const q=questions[idx];answers[q.id]=i;statuses[q.id]="answered";
  const {error}=await sb.from("test_answers").upsert({attempt_id:attempt.id,question_id:q.id,selected_answer:i,is_skipped:false},{onConflict:"attempt_id,question_id"});
  if(error)toast(error.message,"error");renderQuestion();
}
async function skipQ(){
  const q=questions[idx];statuses[q.id]="skipped";answers[q.id]=null;
  await sb.from("test_answers").upsert({attempt_id:attempt.id,question_id:q.id,selected_answer:null,is_skipped:true},{onConflict:"attempt_id,question_id"});
  if(idx<questions.length-1)idx++;renderQuestion();
}
function nextQ(){if(idx<questions.length-1)idx++;renderQuestion()}function prevQ(){if(idx>0)idx--;renderQuestion()}function goQ(i){idx=i;renderQuestion()}
function renderPalette(){palette.innerHTML=questions.map((q,i)=>{const s=i===idx?"current":(statuses[q.id]||"unvisited");return `<button class="qnum ${s}" onclick="goQ(${i})">${i+1}</button>`}).join("")}
function startTimer(){
  if(!test.time_limit_minutes){timer.textContent="No Timer";return}
  secondsLeft=test.time_limit_minutes*60;timerId=setInterval(()=>{secondsLeft--;const m=Math.floor(secondsLeft/60),s=secondsLeft%60;timer.textContent=`${m}:${String(s).padStart(2,"0")}`;if(secondsLeft<=0){clearInterval(timerId);submitTest(true)}},1000)
}
async function submitTest(auto=false){
  if(!auto&&!confirm("Final Submit करें? Submit के बाद answers बदल नहीं सकेंगे।"))return;
  clearInterval(timerId);
  const {data,error}=await sb.rpc("submit_test_attempt",{p_attempt_id:attempt.id});if(error){toast(error.message,"error");return}
  const r=Array.isArray(data)?data[0]:data;
  const {data:review=[],error:re}=await sb.rpc("get_attempt_review",{p_attempt_id:attempt.id});
  testArea.classList.add("hidden");resultBox.classList.remove("hidden");
  const topicMap={};review.forEach(x=>{const key=x.topic||x.subject||"Other";topicMap[key]??={c:0,t:0};topicMap[key].t++;if(x.is_correct)topicMap[key].c++});
  resultBox.innerHTML=`<div class="card"><h2>Test Result</h2><div class="grid"><div class="card span-3"><div class="muted">Score</div><div class="kpi">${r.score}</div></div><div class="card span-3"><div class="muted">Percentage</div><div class="kpi">${r.percentage}%</div></div><div class="card span-3"><div class="muted">Correct</div><div class="kpi">${r.correct_count}</div></div><div class="card span-3"><div class="muted">Wrong / Skip</div><div class="kpi">${r.wrong_count}/${r.skipped_count}</div></div></div></div>
  <div class="card"><h3>Topic-wise Performance</h3>${Object.entries(topicMap).map(([k,v])=>`<div class="item"><b>${esc(k)}</b> — ${Math.round(v.c/v.t*100)}%</div>`).join("")}</div>
  <div class="card"><h3>Question-wise Analysis</h3><div class="list">${review.map((x,i)=>`<div class="item ${x.is_skipped?"analysis-skip":x.is_correct?"analysis-correct":"analysis-wrong"}"><b>Q${i+1}. ${esc(x.question_text)}</b><p>Your Answer: ${esc(JSON.stringify(x.selected_answer))}</p><p>Correct Answer: ${esc(JSON.stringify(x.correct_answer))}</p>${x.explanation?`<p><b>व्याख्या:</b> ${esc(x.explanation)}</p>`:""}</div>`).join("")}</div><p><a class="btn btn-blue" href="student.html">Back to Dashboard</a></p></div>`;
  const dayId=test.schedule_day_id;if(dayId)await sb.rpc("refresh_daily_progress",{p_user_id:user.id,p_schedule_day_id:dayId});
}
async function load(){
  user=await requireAuth();if(!user)return;
  const tRes=await sb.from("tests").select("*").eq("id",testId).single();if(tRes.error){toast(tRes.error.message,"error");return}test=tRes.data;
  const qRes=await sb.from("test_questions").select("*").eq("test_id",testId).order("question_order");if(qRes.error){toast(qRes.error.message,"error");return}questions=qRes.data||[];
  testTitle.textContent=test.title;
  let aRes=await sb.from("test_attempts").select("*").eq("test_id",testId).eq("user_id",user.id).eq("status","in_progress").maybeSingle();
  if(!aRes.data){
    const countRes=await sb.from("test_attempts").select("attempt_no").eq("test_id",testId).eq("user_id",user.id).order("attempt_no",{ascending:false}).limit(1);
    const next=(countRes.data?.[0]?.attempt_no||0)+1;
    const created=await sb.from("test_attempts").insert({test_id:testId,user_id:user.id,attempt_no:next}).select().single();
    if(created.error){toast(created.error.message,"error");return}attempt=created.data;
  }else attempt=aRes.data;
  const saved=await sb.from("test_answers").select("*").eq("attempt_id",attempt.id);(saved.data||[]).forEach(a=>{answers[a.question_id]=a.selected_answer;statuses[a.question_id]=a.is_skipped?"skipped":"answered"});
  startTimer();renderQuestion();
}
load();
