/* GK BY PURUSHOTAM SIR — CBT ONLY FINAL V13
   Fixed hidden test sets + random assignment + fair rank + revision + no PDF.
*/
(function(){
'use strict';
const FINAL_V13='16.1.0';
const legacyLoadCatalog=loadCatalog;
const legacyRenderCurrentQuestion=renderCurrentQuestion;
const legacySelectOption=selectOption;
const legacyGoPrevious=goPrevious;
const legacyGoNext=goNext;
const legacySkipQuestion=skipQuestion;
const legacyResetTestOnly=resetTestOnly;

let finalAssignmentId=null;
let finalSeriesId=null;
let finalSetId=null;
let finalMode='ranked';
let finalSecondsPerQuestion=17;
let finalQuestionSeconds=[];
let finalMarkedQuestions=new Set();
let finalTrackedIndex=null;
let finalQuestionEnterMs=0;
let finalLastAttemptSnapshot=null;
let finalFullSetSnapshot=null;
let finalRestoring=false;
let finalRankData=null;
const FINAL_RESUME_PREFIX='CBT_FINAL_V16_RESUME_';

function finalResumeKey(){return FINAL_RESUME_PREFIX+(currentAuthUser?.id||'guest')}
function finalClampSeconds(v){return Math.max(15,Math.min(17,Number(v)||17))}
function finalCommitQuestionTime(){
  if(finalTrackedIndex===null||finalTrackedIndex<0||!finalQuestionEnterMs)return;
  const spent=Math.max(0,(Date.now()-finalQuestionEnterMs)/1000);
  finalQuestionSeconds[finalTrackedIndex]=Number(((finalQuestionSeconds[finalTrackedIndex]||0)+spent).toFixed(2));
  finalQuestionEnterMs=Date.now();
}
function finalMetrics(){return currentQuestions.map((q,i)=>({question_key:finalQuestionKey(q),seconds:Math.round(finalQuestionSeconds[i]||0)}))}
function finalSaveResume(){
  if(finalRestoring||!currentAuthUser||!currentQuestions.length||testSubmitted)return;
  try{localStorage.setItem(finalResumeKey(),JSON.stringify({v:FINAL_V13,questions:currentQuestions,answers:selectedAnswers,index:currentQuestionIndex,meta:currentTestMeta,startMs:testStartMs,endMs:testEndMs,totalMs:totalTestMs,assignmentId:finalAssignmentId,seriesId:finalSeriesId,setId:finalSetId,mode:finalMode,secondsPerQuestion:finalSecondsPerQuestion,questionSeconds:finalQuestionSeconds,marked:[...finalMarkedQuestions],negative:currentNegativeMarking,savedAt:Date.now()}))}catch(_){ }
}
function finalClearResume(){try{localStorage.removeItem(finalResumeKey())}catch(_){}}
function finalApplyWatermark(){
  let w=document.getElementById('finalStudentWatermark');
  if(!w){w=document.createElement('div');w.id='finalStudentWatermark';document.body.appendChild(w)}
  const sid=String(currentAuthUser?.id||'').slice(0,8).toUpperCase();
  w.textContent=`GK BY PURUSHOTAM SIR • ${sid||'STUDENT'}`;
}
function finalInjectStyles(){
 if(document.getElementById('finalV13Style'))return;
 const s=document.createElement('style');s.id='finalV13Style';s.textContent=`
 #quizSecondsRemainingRow{display:flex;justify-content:center;align-items:baseline;gap:7px;margin:8px 0 2px;font-weight:900;color:#9a3412}#quizSecondsRemaining{font-size:25px}.progress-wrap{overflow:hidden}.progress-fill{transition:width .35s linear}.final-rank-box{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0}.final-rank-box>div{padding:14px;border-radius:14px;background:#eff6ff;border:1px solid #93c5fd;text-align:center}.final-rank-box b{display:block;font-size:24px}.final-practice-note{padding:12px;border-radius:12px;background:#fff7ed;border:1px solid #fdba74;font-weight:800;margin:12px 0}.final-analysis-tools{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.final-analysis-tools button{border:0;border-radius:10px;padding:9px 12px;font-weight:900;cursor:pointer}.final-bookmark-btn{background:#fef3c7}.final-report-btn{background:#fee2e2}.final-repeat-btn{background:#7c3aed!important;color:#fff!important}.final-wrong-btn{background:#ea580c!important;color:#fff!important}.result-tab-patti,.pdf-download-tab-panel,[data-pdf-download-btn],#oneLinerPdfBtn{display:none!important}#finalStudentWatermark{position:fixed;right:8px;bottom:8px;z-index:9998;pointer-events:none;opacity:.18;font-weight:900;font-size:12px;transform:rotate(-8deg);user-select:none}.question-area{-webkit-user-select:none;user-select:none}.status-number-btn.marked-review{box-shadow:0 0 0 3px #7c3aed inset!important;background:#ede9fe!important;color:#4c1d95!important}.status-number-btn.marked-review::after{content:'★';font-size:9px;vertical-align:top;margin-left:2px}#markReviewBtn.is-marked{background:#5b21b6!important;color:#fff!important}@media(max-width:560px){.final-rank-box{grid-template-columns:1fr}}
 `;document.head.appendChild(s);
 document.addEventListener('contextmenu',e=>{if(e.target.closest?.('.question-area,.analysis-page'))e.preventDefault()});
}

loadCatalog=async function(){
 const ok=await legacyLoadCatalog();if(!ok)return ok;
 try{
   const {data,error}=await sb.from('cbt_subject_visibility').select('subject_key,student_visible');
   if(!error&&Array.isArray(data)){
     const allowed=new Set(data.filter(x=>x.student_visible).map(x=>String(x.subject_key)));
     catalogSubjects=catalogSubjects.filter(s=>allowed.has(String(s.key)));
     renderTopics();renderDifficultyOptions();updateLimitOptions();
   }
 }catch(e){console.warn('Subject visibility:',e)}
 return true;
};

async function finalFindSeries(setup){
 if(!setup||setup.distribution.length!==1)return null;
 const u=setup.distribution[0];
 let q=sb.from('cbt_test_series').select('*').eq('subject_key',u.subjectKey).eq('topic_key',u.topicKey).eq('question_count',Number(setup.limit)).eq('is_active',true).order('created_at',{ascending:false}).limit(10);
 const {data,error}=await q;if(error)throw error;
 const rows=data||[];
 return rows.find(x=>String(x.difficulty)===String(setup.difficulty||'all')) || rows.find(x=>String(x.difficulty)==='all') || null;
}
function finalPrepareQuestions(raw,unit){
 return (Array.isArray(raw)?raw:[]).map(q=>{const n=normalizeQuestion(q);return {...n,selected_subject_key:unit?.subjectKey||n.subject_key,selected_subject_name:unit?.subjectName||n.subject_name,selected_topic_key:unit?.topicKey||n.topic_key,selected_topic_name:unit?.topicName||n.topic_name,subject_key:n.subject_key||unit?.subjectKey,subject_name:n.subject_name||unit?.subjectName,topic_key:n.topic_key||unit?.topicKey,topic_name:n.topic_name||unit?.topicName}}).filter(q=>q.options?.length>=4&&q.options.every(Boolean)&&q.answerIndex>=0&&q.answerIndex<=3);
}
function finalBeginQuestions(questions,setup,opts={}){
 currentQuestions=questions;currentQuestionIndex=0;selectedAnswers=new Array(questions.length).fill(null);testSubmitted=false;finalMarkedQuestions=new Set();currentNegativeMarking=!!(setup?.negativeMarking);
 const u=setup?.distribution?.[0]||opts.unit||{};
 currentTestMeta={subjectKey:u.subjectKey||'practice',subjectName:u.subjectName||'Practice',topics:setup?.distribution||[u],units:setup?.distribution||[u],difficulty:setup?.difficulty||opts.difficulty||'all',limit:questions.length,totalQuestions:questions.length,mode:'test',negativeMarking:currentNegativeMarking};
 currentStudent={student_id:currentAuthUser.id,student_name:currentProfile?.full_name||currentAuthUser.email||'Student',roll_number:currentAuthUser.id.slice(0,8).toUpperCase(),is_unlocked:true};
 const roll=byId('rollInfo');if(roll)roll.textContent=`Student ID: ${currentStudent.roll_number}`;
 finalQuestionSeconds=new Array(questions.length).fill(0);finalTrackedIndex=null;finalQuestionEnterMs=0;
 restoreQuizChrome();testStartMs=Date.now();totalTestMs=questions.length*finalSecondsPerQuestion*1000;testEndMs=testStartMs+totalTestMs;totalElapsedSeconds=0;lastStats=null;lastServerResult=null;currentAnalysisIndex=0;finalRankData=null;
 showScreen('quiz');renderCurrentQuestion(true);startTimer();finalSaveResume();finalApplyWatermark();
}

startTest=async function(){
 const setup=validateTestSetup();if(!setup)return;
 const btn=byId('startTestBtn');try{
   if(btn){btn.disabled=true;btn.textContent='Loading...'}
   const series=await finalFindSeries(setup);
   if(series){
     const {data,error}=await sb.rpc('assign_cbt_test_set',{p_series_id:series.id});if(error)throw error;
     const unit=setup.distribution[0];const questions=finalPrepareQuestions(data?.questions,unit);
     if(questions.length!==Number(series.question_count))throw new Error('यह CBT अभी तैयार नहीं है। कृपया थोड़ी देर बाद दोबारा प्रयास करें।');
     finalAssignmentId=data.assignment_id;finalSeriesId=data.series_id;finalSetId=data.set_id;finalMode='ranked';finalSecondsPerQuestion=finalClampSeconds(data.seconds_per_question||series.seconds_per_question);
     finalBeginQuestions(questions,setup);
   }else{
     const questions=await fetchQuestionsForTest(setup.distribution,setup.difficulty);if(!questions.length)throw new Error('Questions नहीं मिले।');
     finalAssignmentId=null;finalSeriesId=null;finalSetId=null;finalMode='practice_random';finalSecondsPerQuestion=17;
     finalBeginQuestions(questions,setup);
     
   }
 }catch(e){console.error(e);alert(e.message||'Test start नहीं हो पाया।')}finally{if(btn){btn.disabled=false;btn.textContent='START TEST'}}
};

renderCurrentQuestion=function(scroll=true){finalCommitQuestionTime();const r=legacyRenderCurrentQuestion(scroll);finalTrackedIndex=currentQuestionIndex;finalQuestionEnterMs=Date.now();const mb=byId('markReviewBtn');if(mb){const marked=finalMarkedQuestions.has(currentQuestionIndex);mb.classList.toggle('is-marked',marked);mb.textContent=marked?'★ MARKED':'☆ MARK REVIEW'}finalSaveResume();return r};
selectOption=function(index,state=null){const r=legacySelectOption(index,state);finalSaveResume();return r};
goPrevious=function(){finalCommitQuestionTime();const r=legacyGoPrevious();finalSaveResume();return r};
goNext=function(){finalCommitQuestionTime();const r=legacyGoNext();finalSaveResume();return r};
skipQuestion=function(){finalCommitQuestionTime();const r=legacySkipQuestion();finalSaveResume();return r};

function finalToggleMarkReview(){if(testSubmitted)return;if(finalMarkedQuestions.has(currentQuestionIndex))finalMarkedQuestions.delete(currentQuestionIndex);else finalMarkedQuestions.add(currentQuestionIndex);const mb=byId('markReviewBtn');if(mb){const marked=finalMarkedQuestions.has(currentQuestionIndex);mb.classList.toggle('is-marked',marked);mb.textContent=marked?'★ MARKED':'☆ MARK REVIEW'}finalSaveResume()}
openStatusModal=function(){const modal=byId('statusModal'),grid=byId('questionStatusGrid');if(!modal||!grid)return;grid.innerHTML=currentQuestions.map((q,i)=>{const answered=selectedAnswers[i]!==null&&selectedAnswers[i]!==undefined;return `<button type="button" class="status-number-btn ${answered?'answered':'not-answered'}${i===currentQuestionIndex?' current':''}${finalMarkedQuestions.has(i)?' marked-review':''}" data-go-question="${i}">${i+1}</button>`}).join('');grid.querySelectorAll('[data-go-question]').forEach(b=>b.addEventListener('click',()=>{currentQuestionIndex=Number(b.dataset.goQuestion);closeStatusModal();renderCurrentQuestion(true)}));modal.classList.remove('hidden')};

updateTimerDisplay=function(){
 if(!currentQuestions.length||!currentTestMeta)return;const now=Date.now();const remain=Math.max(0,testEndMs-now);totalElapsedSeconds=Math.max(0,Math.ceil((totalTestMs-remain)/1000));
 const t=byId('quizTotalTimer');if(t)t.textContent=formatMs(remain);
 const seconds=Math.max(0,Math.ceil(remain/1000));const s=byId('quizSecondsRemaining');if(s)s.textContent=String(seconds);
 const p=byId('quizProgressFill');if(p)p.style.width=`${totalTestMs?Math.max(0,Math.min(100,(remain/totalTestMs)*100)):0}%`;
 if(Math.floor(now/3000)!==Math.floor((now-500)/3000))finalSaveResume();
};

async function finalUpdateWeakFromPractice(){
 if(!currentAuthUser||!['weak_revision','bookmark_revision'].includes(finalMode))return;
 for(let i=0;i<currentQuestions.length;i++){
   if(selectedAnswers[i]!==null&&Number(selectedAnswers[i])===Number(currentQuestions[i].answerIndex)){
     const key=finalQuestionKey(currentQuestions[i]);
     await sb.from('cbt_student_weak_questions').update({mastered:true,last_seen_at:new Date().toISOString()}).eq('student_id',currentAuthUser.id).eq('question_key',key).catch(()=>null);
   }
 }
}
finishTest=async function(){
 if(testSubmitted)return;finalCommitQuestionTime();testSubmitted=true;if(timerInterval){clearInterval(timerInterval);timerInterval=null}totalElapsedSeconds=Math.min(Math.ceil((Date.now()-testStartMs)/1000),Math.ceil(totalTestMs/1000));
 showScreen('result');const area=byId('resultArea');if(area)area.innerHTML='<div style="text-align:center;font-size:20px;font-weight:900;padding:30px">Result तैयार हो रहा है...</div>';
 const stats=calculateStats();let server={};
 if(finalAssignmentId&&finalMode==='ranked'){
   const {data,error}=await sb.rpc('submit_cbt_attempt',{p_assignment_id:finalAssignmentId,p_answers:selectedAnswers,p_time_taken_seconds:totalElapsedSeconds,p_question_metrics:finalMetrics(),p_negative_marking:currentNegativeMarking});
   if(error){console.warn(error);server={save_error:error.message}}else server=data||{};
 }else {
   await finalUpdateWeakFromPractice();
   try{
     const topic=(currentTestMeta?.topics||[])[0]||{};
     await sb.from('cbt_practice_history').insert({student_id:currentAuthUser.id,mode:['practice_random','practice_full','practice_wrong','weak_revision','bookmark_revision'].includes(finalMode)?finalMode:'practice_random',subject_name:currentTestMeta?.subjectName||topic.subjectName||'Practice',topic_name:topic.topicName||'Practice',total_questions:stats.total,correct_answers:stats.correct,wrong_answers:stats.wrong,skipped_questions:stats.skipped,score:stats.scoreMarks,total_marks:stats.totalMarks,percentage:stats.percentage,time_taken_seconds:totalElapsedSeconds});
   }catch(e){console.warn('Practice history save:',e)}
 }
 finalLastAttemptSnapshot={questions:currentQuestions.slice(),answers:selectedAnswers.slice(),meta:currentTestMeta,secondsPerQuestion:finalSecondsPerQuestion,setId:finalSetId,rankData:server};
 if(['ranked','practice_random'].includes(finalMode)) finalFullSetSnapshot={questions:currentQuestions.slice(),meta:currentTestMeta,secondsPerQuestion:finalSecondsPerQuestion,setId:finalSetId};
 lastStats=stats;lastServerResult=server;finalRankData=server;finalClearResume();renderResult(stats,server);triggerCelebrationByPercentage(stats.percentage);
};

function finalOfficialText(server){
 if(!server||!server.participants)return '';
 const rank=server.official_rank?server.official_rank:'—';
 return `<div class="final-rank-box"><div><span>आपकी Official Rank</span><b>${safeText(rank)}</b></div><div><span>इसी Fixed Test को देने वाले</span><b>${safeText(server.participants)}</b></div></div>`;
}
renderResult=function(stats,server={}){
 const area=byId('resultArea');if(!area)return;const official=finalMode==='ranked'&&server.is_ranked!==false;const msg=getResultMessage(stats.percentage);
 area.innerHTML=`<h2 class="result-title">आपका Result</h2><div class="result-message ${msg.className}"><h2>${safeText(msg.title)}</h2><p>${safeText(msg.line)}</p></div>${finalOfficialText(server)}${!official?'<div class="final-practice-note">Practice / Re-attempt: आपकी पहली Official Rank और Score बदले नहीं हैं।</div>':''}<div class="result-grid"><div class="result-item"><span>Total Questions</span>${stats.total}</div><div class="result-item"><span>Correct</span>${stats.correct}</div><div class="result-item"><span>Wrong</span>${stats.wrong}</div><div class="result-item"><span>Skipped</span>${stats.skipped}</div><div class="result-item"><span>Score</span>${formatScore(stats.scoreMarks)}/${formatScore(stats.totalMarks)}</div><div class="result-item"><span>Percentage</span>${formatScore(stats.percentage)}%</div><div class="result-item"><span>Time Taken</span>${formatTime(totalElapsedSeconds)}</div><div class="result-item"><span>Weak Area</span>${safeText(getWeakArea(stats))}</div></div>${buildPerformanceTable('Topic-wise Performance',stats.topicStats,'topic')}<div class="result-actions"><button class="result-btn blue-btn" id="analyzeBtn">ANALYZE</button><button class="result-btn purple-btn" id="leaderboardBtn">LEADERBOARD</button><button class="result-btn final-wrong-btn" id="wrongRepeatBtn">गलत प्रश्न दोहराएँ</button><button class="result-btn final-repeat-btn" id="fullRepeatBtn">पूरा टेस्ट दोबारा दें</button><button class="result-btn green-btn" id="newTestBtn">NEW RANDOM TEST</button><button class="result-btn gray-btn" id="homeBtn">HOME</button></div><div class="final-practice-note">Question Paper / Answer Key की PDF/JPG Download उपलब्ध नहीं है। Analysis App के अंदर ही करें।</div>`;
 byId('analyzeBtn')?.addEventListener('click',openAnalysis);byId('leaderboardBtn')?.addEventListener('click',openTopperList);byId('wrongRepeatBtn')?.addEventListener('click',finalRepeatWrong);byId('fullRepeatBtn')?.addEventListener('click',finalRepeatFull);byId('newTestBtn')?.addEventListener('click',startNewTestSameSelection);byId('homeBtn')?.addEventListener('click',goHome);showScreen('result');
};

function finalPracticeStart(questions,mode){
 if(!questions.length){alert('इस mode के लिए प्रश्न नहीं हैं।');return}finalAssignmentId=null;finalSeriesId=null;finalMode=mode;finalSecondsPerQuestion=finalClampSeconds(finalLastAttemptSnapshot?.secondsPerQuestion||17);
 const meta=finalLastAttemptSnapshot?.meta||currentTestMeta||{};const unit=(meta.topics||[])[0]||{subjectKey:questions[0].subject_key,subjectName:questions[0].subject_name,topicKey:questions[0].topic_key,topicName:questions[0].topic_name};const setup={distribution:meta.topics?.length?meta.topics:[unit],difficulty:meta.difficulty||'all',negativeMarking:false};finalBeginQuestions(questions.map(q=>({...q})),setup,{unit});
}
function finalRepeatFull(){const snap=finalFullSetSnapshot||finalLastAttemptSnapshot;if(!snap)return;finalPracticeStart(snap.questions,'practice_full')}
function finalRepeatWrong(){const snap=finalLastAttemptSnapshot;if(!snap)return;const qs=snap.questions.filter((q,i)=>snap.answers[i]===null||Number(snap.answers[i])!==Number(q.answerIndex));if(!qs.length){alert('इस attempt में कोई गलत/छोड़ा हुआ प्रश्न नहीं है।');return}finalPracticeStart(qs,'practice_wrong')}

function finalQuestionKeySafe(q){try{return finalQuestionKey(q)}catch(_){return String(q.id||normalizeText(q.question||q.question_text||''))}}
async function finalToggleBookmark(q){
 const key=finalQuestionKeySafe(q);const chk=await sb.from('cbt_bookmarks').select('question_key').eq('student_id',currentAuthUser.id).eq('question_key',key).maybeSingle();
 if(chk.data){const r=await sb.from('cbt_bookmarks').delete().eq('student_id',currentAuthUser.id).eq('question_key',key);if(r.error)alert(r.error.message);else alert('Bookmark हट गया।')}
 else{const r=await sb.from('cbt_bookmarks').upsert({student_id:currentAuthUser.id,question_key:key,question_payload:q});if(r.error)alert(r.error.message);else alert('Question Bookmark हो गया।')}
}
async function finalReportQuestion(q){
 const text=prompt('Question/Answer में क्या check करना है?','Question/answer check requested');if(text===null)return;const r=await sb.from('cbt_question_reports').insert({student_id:currentAuthUser.id,question_key:finalQuestionKeySafe(q),question_payload:q,report_text:text||'Question/answer check requested'});if(r.error)alert(r.error.message);else alert('Report Admin को भेज दी गई।');
}
renderAnalysis=function(){
 showScreen('result');const area=byId('resultArea');if(!area)return;if(currentAnalysisIndex>=currentQuestions.length){area.innerHTML='<div class="analysis-page"><div class="analysis-complete">Analysis Complete</div><div class="analysis-actions"><button class="analysis-btn gray-btn" id="analysisPrevEndBtn">PREVIOUS</button><button class="analysis-btn blue-btn" id="analysisResultEndBtn">RESULT</button><button class="analysis-btn gray-btn" id="analysisHomeEndBtn">HOME</button></div></div>';byId('analysisPrevEndBtn')?.addEventListener('click',analysisPrevious);byId('analysisResultEndBtn')?.addEventListener('click',backToResult);byId('analysisHomeEndBtn')?.addEventListener('click',goHome);return}
 const q=currentQuestions[currentAnalysisIndex],ua=selectedAnswers[currentAnalysisIndex],ca=q.answerIndex,status=getAnalysisStatus(q,ua),opts=getDisplayOptions(q),fixed=removeInlineOptionsFromQuestion(q.question||q.question_text||'',opts),qh=buildQuestionHtml(fixed.questionText,currentAnalysisIndex+1);
 area.innerHTML=`<div class="analysis-page"><div class="analysis-head"><div class="analysis-pill">Q. ${currentAnalysisIndex+1}/${currentQuestions.length}</div><div class="analysis-pill">${safeText(q.selected_topic_name||q.topic_name||'Topic')}</div><div class="analysis-pill ${status.pillClass}">${safeText(status.text)}</div></div><div class="analysis-question">${qh}</div><div class="analysis-box ${status.answerClass}"><strong>Your Answer:</strong> ${safeText(getAnswerText(q,ua))}</div><div class="analysis-box correct-answer-box"><strong>Correct Answer:</strong> ${safeText(getAnswerText(q,ca))}</div><div class="analysis-box explanation-box"><strong>Explanation:</strong> ${safeText(q.explanation||'Explanation available नहीं है।')}</div><div class="final-analysis-tools"><button class="final-bookmark-btn" id="finalBookmarkBtn">⭐ Bookmark</button><button class="final-report-btn" id="finalReportBtn">⚑ Report Question</button></div><div class="analysis-actions"><button class="analysis-btn gray-btn" id="analysisPrevBtn" ${currentAnalysisIndex===0?'disabled':''}>PREVIOUS</button><button class="analysis-btn blue-btn" id="analysisNextBtn">NEXT</button><button class="analysis-btn purple-btn" id="analysisResultBtn">RESULT</button><button class="analysis-btn gray-btn" id="analysisHomeBtn">HOME</button></div></div>`;
 byId('finalBookmarkBtn')?.addEventListener('click',()=>finalToggleBookmark(q));byId('finalReportBtn')?.addEventListener('click',()=>finalReportQuestion(q));byId('analysisPrevBtn')?.addEventListener('click',analysisPrevious);byId('analysisNextBtn')?.addEventListener('click',analysisNext);byId('analysisResultBtn')?.addEventListener('click',backToResult);byId('analysisHomeBtn')?.addEventListener('click',goHome);
};

async function finalStartSavedMode(mode){
 if(!currentAuthUser)return false;
 const table=mode==='bookmarks'?'cbt_bookmarks':'cbt_student_weak_questions';let q=sb.from(table).select('question_payload').eq('student_id',currentAuthUser.id).limit(100);if(mode!=='bookmarks')q=q.eq('mastered',false).order('last_seen_at',{ascending:false});
 const {data,error}=await q;if(error){alert(error.message);return false}const pool=(data||[]).map(x=>normalizeQuestion(x.question_payload)).filter(x=>x.options?.length>=4&&x.answerIndex>=0);if(!pool.length){alert(mode==='bookmarks'?'कोई Bookmarked Question नहीं है।':'अभी कोई Weak Question नहीं है।');return false}
 shuffleArray(pool);const questions=pool.slice(0,Math.min(20,pool.length));finalAssignmentId=null;finalSeriesId=null;finalSetId=null;finalMode=mode==='bookmarks'?'bookmark_revision':'weak_revision';finalSecondsPerQuestion=17;const unit={subjectKey:'revision',subjectName:'Revision',topicKey:finalMode,topicName:mode==='bookmarks'?'Bookmarked Questions':'Weak Questions'};finalBeginQuestions(questions,{distribution:[unit],difficulty:'all',negativeMarking:false},{unit});return true;
}

async function finalRestoreResume(){
 let raw=null;try{raw=JSON.parse(localStorage.getItem(finalResumeKey())||'null')}catch(_){return false}if(!raw||raw.v!==FINAL_V13||!Array.isArray(raw.questions)||!raw.questions.length)return false;
 finalRestoring=true;try{
   currentQuestions=raw.questions.map(normalizeQuestion);selectedAnswers=Array.isArray(raw.answers)?raw.answers:new Array(currentQuestions.length).fill(null);currentQuestionIndex=Math.max(0,Math.min(currentQuestions.length-1,Number(raw.index)||0));currentTestMeta=raw.meta;testStartMs=Number(raw.startMs)||Date.now();testEndMs=Number(raw.endMs)||Date.now();totalTestMs=Number(raw.totalMs)||currentQuestions.length*17000;finalAssignmentId=raw.assignmentId||null;finalSeriesId=raw.seriesId||null;finalSetId=raw.setId||null;finalMode=raw.mode||'ranked';finalSecondsPerQuestion=finalClampSeconds(raw.secondsPerQuestion);finalQuestionSeconds=Array.isArray(raw.questionSeconds)?raw.questionSeconds:new Array(currentQuestions.length).fill(0);finalMarkedQuestions=new Set(Array.isArray(raw.marked)?raw.marked.map(Number):[]);currentNegativeMarking=!!raw.negative;testSubmitted=false;currentStudent={student_id:currentAuthUser.id,student_name:currentProfile?.full_name||currentAuthUser.email||'Student',roll_number:currentAuthUser.id.slice(0,8).toUpperCase()};restoreQuizChrome();showScreen('quiz');legacyRenderCurrentQuestion(true);finalTrackedIndex=currentQuestionIndex;finalQuestionEnterMs=Date.now();finalApplyWatermark();
   if(Date.now()>=testEndMs){updateTimerDisplay();setTimeout(()=>finishTest(),50)}else startTimer();return true;
 }finally{finalRestoring=false}
}

resetTestOnly=function(){finalClearResume();finalAssignmentId=null;finalSeriesId=null;finalSetId=null;finalMode='ranked';finalQuestionSeconds=[];finalMarkedQuestions=new Set();finalTrackedIndex=null;finalQuestionEnterMs=0;finalLastAttemptSnapshot=null;finalFullSetSnapshot=null;return legacyResetTestOnly()};

// Student must never receive PDF/JPG download UI.
openPdfOptionsModal=function(){alert('Question Paper / Answer Key Download उपलब्ध नहीं है। Analysis App के अंदर करें।')};
printOneLinerPdf=openPdfOptionsModal;
renderPdfDownloadTab=openPdfOptionsModal;
buildResultTabPatti=function(){return ''};
bindResultTabPatti=function(){};
openTopperList=async function(){
 if(!finalSetId){alert('Leaderboard केवल Official Fixed Test attempt के बाद उपलब्ध है।');return}const {data,error}=await sb.rpc('get_cbt_set_leaderboard',{p_set_id:finalSetId,p_limit:50});if(error){alert(error.message);return}const area=byId('resultArea');if(!area)return;area.innerHTML=`<div class="topper-page"><h2 class="result-title">Leaderboard</h2><div class="final-practice-note">यह ranking उसी question-set को attempt करने वाले विद्यार्थियों के fair comparison पर आधारित है।</div>${(data||[]).map(x=>`<div class="topper-card"><div class="topper-rank">#${x.rank_no}</div><div class="topper-info"><h4>${safeText(x.student_name)}</h4><p>${safeText(x.percentage)}%</p></div><div class="topper-score"><strong>${safeText(x.score)}</strong><small>${formatTime(x.time_taken_seconds)}</small></div></div>`).join('')||'<div class="topper-empty">अभी leaderboard खाली है।</div>'}<button class="result-btn gray-btn" id="leaderBack">RESULT</button></div>`;byId('leaderBack')?.addEventListener('click',backToResult);showScreen('result')
};

finalInjectStyles();
byId('markReviewBtn')?.addEventListener('click',finalToggleMarkReview);
window.addEventListener('cbt-student-app-ready',async()=>{
 finalInjectStyles();finalApplyWatermark();
 const restored=await finalRestoreResume();if(restored)return;
 const mode=new URLSearchParams(location.search).get('mode');if(mode==='weak'||mode==='bookmarks')await finalStartSavedMode(mode);
});
window.addEventListener('beforeunload',()=>{finalCommitQuestionTime();finalSaveResume()});
setInterval(()=>{if(currentQuestions.length&&!testSubmitted)finalSaveResume()},3000);

// Keep explicit window exports aligned with overridden functions.
Object.assign(window,{startTest,goPrevious,goNext,skipQuestion,finishTest,openAnalysis,openStatusModal,openPdfOptionsModal,printOneLinerPdf,openTopperList});
})();
