
/* GK BY PURUSHOTAM SIR — FINAL SAVE/AUTH/RESULT PATCH */
(function(){
'use strict';

const SB = () => window.supabaseClient || window.sb || window.supabase;
const toast = (msg, ok=false) => {
  let x=document.getElementById('gd-final-toast');
  if(!x){x=document.createElement('div');x.id='gd-final-toast';document.body.appendChild(x);}
  x.textContent=msg;x.className='gd-final-toast '+(ok?'ok':'bad');x.style.display='block';
  clearTimeout(window.__gdToast);window.__gdToast=setTimeout(()=>x.style.display='none',2600);
};

function parseVerification(raw){
  const blocks = String(raw||'').split(/\n\s*-{3,}\s*\n|(?=प्रश्न\s*\d+\s*[.।])/i).map(x=>x.trim()).filter(Boolean);
  const rows=[];
  for(const block of blocks){
    const q=(block.match(/प्रश्न\s*\d+\s*[.।]\s*([\s\S]*?)(?=\n\s*(?:\(?A\)?|A[.)]|(?:\(?क\)?))[.)]?\s*)/i)||[])[1]||'';
    const getOpt=(letters)=> {
      const rx=new RegExp('(?:^|\\n)\\s*(?:\\(?'+letters+'\\)?)[.)]?\\s*([^\\n]+)','im');
      return (block.match(rx)||[])[1]?.trim()||'';
    };
    const opts=[getOpt('A|क'),getOpt('B|ख'),getOpt('C|ग'),getOpt('D|घ')];
    const am=block.match(/उत्तर\s*[:：-]\s*\(?\s*([ABCDकखगघ])\s*\)?/i);
    const map={A:0,B:1,C:2,D:3,'क':0,'ख':1,'ग':2,'घ':3};
    const answer=am ? map[am[1].toUpperCase?.() || am[1]] : undefined;
    const explanation=(block.match(/व्याख्या\s*[:：-]\s*([\s\S]*)$/i)||[])[1]?.trim()||'';
    if(q && opts.every(Boolean) && answer!==undefined) rows.push({question_text:q.trim(),options:opts,correct_option:answer,explanation});
  }
  return rows;
}

async function saveBulkVerification(btn){
  const card=btn.closest('.target-card,.verification-card,.card,[data-target-id]') || btn.parentElement;
  const area=card?.querySelector('textarea');
  const raw=area?.value?.trim();
  if(!raw) return toast('पहले Verification Question Data डालिए।');
  const parsed=parseVerification(raw);
  if(!parsed.length) return toast('Question format नहीं पढ़ा गया। प्रश्न, चार विकल्प और उत्तर जाँचिए।');

  const targetId=btn.dataset.targetId || card?.dataset.targetId || card?.querySelector('[data-target-id]')?.dataset.targetId;
  const scheduleDayId=btn.dataset.scheduleDayId || card?.dataset.scheduleDayId || document.querySelector('[data-schedule-day-id]')?.dataset.scheduleDayId;
  const hide=(card?.querySelector('input[type=radio][value*="hide"]:checked,select[name*=visibility]')?.value||'').toLowerCase().includes('hide');

  const client=SB();
  if(!client?.from) return toast('Supabase connection उपलब्ध नहीं है।');

  btn.disabled=true; const old=btn.textContent; btn.textContent='Saving...';
  try{
    // Try known table names, preserving compatibility with earlier builds.
    const candidates=['target_verification_questions','verification_questions','daily_target_verifications'];
    let lastErr=null, saved=false;
    for(const table of candidates){
      const payload=parsed.map((x,i)=>({
        ...(targetId?{target_id:targetId}:{}),
        ...(scheduleDayId?{schedule_day_id:scheduleDayId}:{}),
        question_text:x.question_text,
        options:x.options,
        correct_option:x.correct_option,
        explanation:x.explanation,
        question_hidden:hide,
        sort_order:i+1
      }));
      let del=client.from(table).delete();
      if(targetId) del=del.eq('target_id',targetId);
      else if(scheduleDayId) del=del.eq('schedule_day_id',scheduleDayId);
      await del;
      const res=await client.from(table).insert(payload);
      if(!res.error){saved=true;break;}
      lastErr=res.error;
    }
    if(!saved) throw lastErr || new Error('Verification save failed');
    toast(parsed.length+' Verification Question Saved Successfully',true);
    const count=card?.querySelector('.existing-count,[data-existing-count]');
    if(count) count.textContent='Existing: '+parsed.length;
  }catch(e){
    console.error(e);
    toast('Save नहीं हुआ: '+(e?.message||'Database permission/table error'));
  }finally{btn.disabled=false;btn.textContent=old;}
}

document.addEventListener('click',e=>{
  const b=e.target.closest('[data-save-bulk-verification],.save-verification-bulk,#saveVerificationQuestions');
  if(b){e.preventDefault();e.stopImmediatePropagation();saveBulkVerification(b);}
},true);

/* Never reveal answers/explanations until pass score is achieved. */
document.addEventListener('gd:test-result',e=>{
  const d=e.detail||{};
  if(Number(d.score)<Number(d.passingScore)){
    document.querySelectorAll('.correct-answer,.answer-explanation,.question-review,.explanation').forEach(x=>x.style.display='none');
  }
});

/* Forgot-password helper for email-based Supabase accounts. */
window.GD_FORGOT_PASSWORD = async function(email){
  const client=SB();
  if(!email) return toast('Registered email डालिए।');
  const redirectTo=location.origin+location.pathname.replace(/[^/]+$/,'index.html')+'?reset=1';
  const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo});
  if(error) return toast(error.message);
  toast('Password reset link भेज दिया गया है।',true);
};
})();
