import { resumeUiStep, assertResumeRecipient } from './web/src/lib/boss/send-resume.mjs';
import { readCurrentResumeChat } from './web/src/lib/boss/resume-chat.mjs';
export const ORIGINAL_RESUME_FILENAME = 'candidate-resume.pdf';

/** Sends only an already uploaded, exact filename in the currently verified thread. */
export async function sendExistingResume({ command, recipient, filename, expectedIncomingId, previous, save, wait = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (!filename || !expectedIncomingId) throw new Error('缺少已授权简历版本或消息标识');
  if (['sent', 'sending', 'unknown'].includes(previous?.status)) return { ...previous, status: previous.status === 'sent' ? 'sent' : 'unknown', filename };
  const evaluate = async code => {
    const result = await command('evaluate', { code });
    return typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
  };
  const chat = () => evaluate(`JSON.stringify((${readCurrentResumeChat.toString()})())`);
  const step = (op, data = {}) => evaluate(`JSON.stringify((()=>{const op=${JSON.stringify(op)},data=${JSON.stringify(data)};if(op==='send'){const incoming=[...document.querySelectorAll('.chat-record .item-friend[data-mid]')].filter(e=>e.querySelector('.text-content')).at(-1);if(incoming?.getAttribute('data-mid')!==${JSON.stringify(expectedIncomingId)})throw new Error('最新消息已变化，未发送');}return (${resumeUiStep.toString()})(op,data)})())`);
  const assert = async () => assertResumeRecipient(recipient, await chat(), recipient);
  const poll = async fn => { for (let i=0;i<20;i++) { const value=await fn(); if(value)return value; await wait(500); } return false; };
  let attempted=false;
  try {
    await assert();
    const before=await step('evidence',{filename});
    if(before.some(e=>e.exact&&e.id&&!e.failed&&/已发送|送达|已读|已发/.test(e.text))) {
      const result={status:'sent',filename,recipient,message:'已有该附件成功记录，未重复发送。'};await save(result);return result;
    }
    const chooserOpen=await evaluate("JSON.stringify(!!document.querySelector('.dialog-wrap.active .resume-list'))");
    if(!chooserOpen)await step('openChooser');
    if(!await poll(()=>step('choose',{filename})))throw new Error('附件库没有唯一匹配的原始简历，未发送');
    await assert();
    await save({status:'sending',filename,recipient});attempted=true;
    await step('send',{filename,recipient});
    const evidence=await poll(async()=>{await assert();return (await step('evidence',{filename})).find(e=>e.id&&!before.some(old=>old.id===e.id)&&!e.failed&&/已发送|送达|已读|已发/.test(e.text));});
    const result={status:evidence?'sent':'unknown',filename,recipient,message:evidence?'已核对原始附件发送回执。':'发送结果待核对，不自动重发。',...(evidence?{messageId:evidence.id}:{})};await save(result);return result;
  }catch(error){const result={status:attempted?'unknown':'blocked',filename,recipient,message:error.message};if(attempted)await save(result);return result;}
}
