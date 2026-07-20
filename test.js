let user,test,questions=[],attempt=null,idx=0,answers={},timerId=null,secondsLeft=0;const testId=new URLSearchParams(location.search).get('id');
function extra(q){let h='';if(q.instructions)h+=`<p class="muted">${esc(q.instructions)}</p>`;if(Array.isArray(q.statements)&&q.statements.length)h+=`<ol>${q.statements.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`;if(q.assertion_text)h+=`<p><b>अभिकथन:</b> ${esc(q.assertion_text)}</p>`;if(q.reason_text)h+=`<p><b>कारण:</b> ${esc(q.reason_text)}</p>`;if(Array.isArray(q.list_a)||Array.isArray(q.list_b))h+=`<div class="grid"><div class="span-6"><b>सूची-I</b><ol>${(q.list_a||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div class="span-6"><b>सूची-II</b><ol>${(q.list_b||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div></div>`;if(Array.isArray(q.sequence_items)&&q.sequence_items.length)h+=`<ol>${q.sequence_items.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`;return h}
function renderQuestion(){const q=questions[idx],opts=Array.isArray(q.options)?q.options:[];questionBox.innerHTML=`<div class="row wrap"><span class="badge badge-blue">Question ${idx+1}/${questions.length}</span><span class="badge badge-gray">${esc(q.question_type)}</span></div><h2>${esc(q.question_text)}</h2>${extra(q)}${opts.map((o,i)=>`<button class="final-option ${answers[q.id]===i?'selected-final':''}" onclick="choose(${i})"><b>${String.fromCharCode(65+i)}.</b> ${esc(typeof o==='string'?o:(o.text||JSON.stringify(o)))}</button>`).join('')}`}
async function choose(i){const q=questions[idx];answers[q.id]=i;const r=await sb.from('test_answers').upsert({attempt_id:attempt.id,question_id:q.id,selected_answer:i,is_skipped:false},{onConflict:'attempt_id,question_id'});if(r.error)toast(r.error.message,'error');renderQuestion()}
function nextQ(){const q=questions[idx];if(answers[q.id]===undefined||answers[q.id]===null){const old=document.querySelector('.answer-required-toast');if(old)old.remove();const el=document.createElement('div');el.className='answer-required-toast';el.textContent='पहले कोई एक उत्तर चुनिए।';document.body.appendChild(el);setTimeout(()=>el.remove(),2200);return}if(idx<questions.length-1){idx++;renderQuestion()}else submitTest()}
function prevQ(){if(idx>0){idx--;renderQuestion()}}
function runTimer(){if(!test.time_limit_minutes){timer.textContent='No Timer';return}secondsLeft=test.time_limit_minutes*60;timerId=setInterval(()=>{secondsLeft--;const m=Math.floor(secondsLeft/60),s=secondsLeft%60;timer.textContent=`${m}:${String(s).padStart(2,'0')}`;if(secondsLeft<=0){clearInterval(timerId);submitTest(true)}},1000)}
async function startTest(){startScreen.classList.add('hidden');testArea.classList.remove('hidden');let a=await sb.from('test_attempts').select('*').eq('test_id',testId).eq('user_id',user.id).eq('status','in_progress').maybeSingle();if(!a.data){const last=await sb.from('test_attempts').select('attempt_no').eq('test_id',testId).eq('user_id',user.id).order('attempt_no',{ascending:false}).limit(1);const next=(last.data?.[0]?.attempt_no||0)+1;const c=await sb.from('test_attempts').insert({test_id:testId,user_id:user.id,attempt_no:next}).select().single();if(c.error){toast(c.error.message,'error');return}attempt=c.data}else attempt=a.data;const saved=await sb.from('test_answers').select('*').eq('attempt_id',attempt.id);(saved.data||[]).forEach(x=>answers[x.question_id]=x.selected_answer);runTimer();renderQuestion()}
async function submitTest(auto=false){
  if(!auto&&!confirm('Test Submit करें?'))return;
  clearInterval(timerId);
  const r=await sb.rpc('submit_test_attempt',{p_attempt_id:attempt.id});
  if(r.error){toast(r.error.message,'error');return}
  const result=Array.isArray(r.data)?r.data[0]:r.data;
  const pass=Number(result.percentage)>=Number(test.passing_percent||0);
  testArea.classList.add('hidden');resultBox.classList.remove('hidden');

  const summary=`<div class="card hero-premium"><h2>${pass?'✅ Test Passed':'❌ Passing Score पूरा नहीं हुआ'}</h2><p>Required: ${test.passing_percent}% • Your Score: ${result.percentage}%</p></div>
  <div class="card"><h2>Test Result</h2><div class="grid">
  <div class="kpi-card kpi-blue span-3"><div class="muted">Total</div><div class="kpi">${questions.length}</div></div>
  <div class="kpi-card kpi-green span-3"><div class="muted">Correct</div><div class="kpi">${result.correct_count}</div></div>
  <div class="kpi-card kpi-red span-3"><div class="muted">Wrong</div><div class="kpi">${result.wrong_count}</div></div>
  <div class="kpi-card kpi-orange span-3"><div class="muted">Unattempted</div><div class="kpi">${result.skipped_count}</div></div>
  </div></div>`;

  if(!pass){
    resultBox.innerHTML=summary+`<div class="card"><h3>दोबारा प्रयास करें</h3><p>Passing score पूरा होने से पहले सही उत्तर और व्याख्या नहीं दिखाई जाएगी।</p><p><a class="btn btn-blue" href="test.html?id=${test.id}">Retry Test</a> <a class="btn btn-light" href="student.html">Back to Dashboard</a></p></div>`;
  }else{
    const review=await sb.rpc('get_attempt_review',{p_attempt_id:attempt.id});
    const reviewHtml=(review.data||[]).map((x,i)=>`<div class="item ${x.is_correct?'analysis-correct':x.is_skipped?'analysis-skip':'analysis-wrong'}"><b>Q${i+1}. ${esc(x.question_text)}</b><p>Your Answer: ${esc(JSON.stringify(x.selected_answer))}</p><p>Correct Answer: ${esc(JSON.stringify(x.correct_answer))}</p>${x.explanation?`<p><b>व्याख्या:</b> ${esc(x.explanation)}</p>`:''}</div>`).join('');
    resultBox.innerHTML=summary+`<div class="card"><h3>Question-wise Analysis</h3><div class="list">${reviewHtml}</div><p><a class="btn btn-blue" href="student.html">Back to Dashboard</a></p></div>`;
  }
  if(test.schedule_day_id)await sb.rpc('refresh_daily_progress',{p_user_id:user.id,p_schedule_day_id:test.schedule_day_id});
}
async function load(){user=await requireAuth();if(!user)return;const tr=await sb.from('tests').select('*').eq('id',testId).single();if(tr.error){toast(tr.error.message,'error');return}test=tr.data;const qr=await sb.from('test_questions').select('*').eq('test_id',testId).order('question_order');if(qr.error){toast(qr.error.message,'error');return}questions=qr.data||[];startTitle.textContent=test.title;startMeta.textContent=`${questions.length} Questions • ${test.time_limit_minutes||'No timer'} min • Pass ${test.passing_percent||0}%`}
load();
