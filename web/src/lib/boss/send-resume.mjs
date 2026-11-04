import { readCurrentResumeChat } from './resume-chat.mjs';
export function resumeUploadFilename(version) {
  return `${version.company}_${version.title}`.replace(/[\\/\u0000-\u001f]/g,'_').slice(0,45)+`_${version.id.slice(-8)}.pdf`;
}

export function assertResumeRecipient(version, chat, expected) {
  if (!chat || chat.company !== version.company || chat.title !== version.title || !chat.recruiter) throw new Error('当前 BOSS 聊天的公司或岗位不匹配，请打开对应沟通后重试。');
  if (expected && chat.recruiter !== expected.recruiter) throw new Error('当前聊天收件人已经变化，发送已停止。');
  if (!chat.canSendResume) throw new Error('BOSS 要求双方回复后才能发送附件，当前尚未开放。');
}

// This function runs in the rendered BOSS page, never calls internal APIs.
export function resumeUiStep(op, data = {}) {
  if (location.origin !== 'https://www.zhipin.com') throw new Error('BOSS 页面已变化');
  const visible = e => !!e && e.getBoundingClientRect().width > 0;
  if (op === 'library') return [...document.querySelectorAll('.resume-attachment .basis a')].map(e => e.textContent.trim());
  if (op === 'openUpload') {
    const buttons = [...document.querySelectorAll('.resume-attachment .operate-list-item')].filter(e => e.textContent.trim() === '上传简历');
    if (buttons.length !== 1 || /disabled|unable/.test(buttons[0].className)) throw new Error('附件库已满或无法上传，请在 BOSS 管理附件后重试。');
    buttons[0].click(); return true;
  }
  if (op === 'upload') {
    const dialog = [...document.querySelectorAll('.upload-resume-dialog')].find(visible);
    const input = dialog?.querySelector('input[ka="user-resume-upload-file"]');
    if (!input) throw new Error('未找到可用的附件上传窗口');
    const bytes = Uint8Array.from(atob(data.base64), c => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], data.filename, {type:'application/pdf'}));
    input.files = dt.files; input.dispatchEvent(new Event('change',{bubbles:true})); return true;
  }
  if (op === 'uploadReady') return [...document.querySelectorAll('.upload-resume-dialog')].some(e=>visible(e)&&e.querySelector('input[ka="user-resume-upload-file"]'));
  if (op === 'confirmUpload') {
    const dialog = [...document.querySelectorAll('.upload-preview-dialog')].find(visible);
    if (!dialog || ![...dialog.querySelectorAll('.preview-sider p')].some(e=>e.textContent.trim() === '附件名称：'+data.filename)) return false;
    const button = dialog.querySelector('button[ka="user_resume_add_sure"]');
    if (!button || button.disabled) return false; button.click(); return true;
  }
  if (op === 'selectChat') {
    const rows = [...document.querySelectorAll('.chat-user .name-box')].filter(e => {
      const spans = [...e.children].map(c=>c.textContent.trim());
      return spans[0] === data.recruiter && spans[1] === data.company;
    });
    if (rows.length !== 1) return false; rows[0].click(); return true;
  }
  if (op === 'openChooser') {
    const e = [...document.querySelectorAll('.chat-editor .toolbar-btn')].find(e=>e.textContent.trim()==='发简历');
    if (!e || e.classList.contains('unable')) throw new Error('当前不能发送附件'); e.click(); return true;
  }
  if (op === 'choose') {
    const dialog = [...document.querySelectorAll('.dialog-wrap.active')].find(e=>e.querySelector('.resume-list'));
    const rows = [...(dialog?.querySelectorAll('.resume-list .list-item') || [])].filter(e=>e.querySelector('.resume-name')?.textContent.trim()===data.filename);
    if (rows.length !== 1) return false; rows[0].click(); return true;
  }
  if (op === 'send') {
    const root = document.querySelector('.chat-conversation');
    const info = root?.querySelector('.base-info');
    const company = [...(info?.children || [])].find(e=>e.tagName==='SPAN'&&!e.className)?.textContent?.trim();
    if (location.pathname!=='/web/geek/chat' || company!==data.recipient.company || root?.querySelector('.position-name')?.textContent?.trim()!==data.recipient.title || root?.querySelector('.base-info .name-text')?.textContent?.trim()!==data.recipient.recruiter) throw new Error('发送前收件人已改变');
    const dialog = [...document.querySelectorAll('.dialog-wrap.active')].find(e=>e.querySelector('.resume-list'));
    const selected = [...(dialog?.querySelectorAll('.resume-list .list-item') || [])].filter(e=>/selected|active|checked/.test(e.className));
    if (selected.length!==1 || selected[0].querySelector('.resume-name')?.textContent.trim()!==data.filename) throw new Error('附件选择状态不确定，未发送');
    const button = dialog.querySelector('.btn-confirm');
    if (!button || button.disabled || button.textContent.trim()!=='发送') throw new Error('发送按钮尚未就绪');
    button.click(); return true;
  }
  if (op === 'evidence') return [...document.querySelectorAll('.chat-record .item-myself,.chat-record .item-system')].filter(e=>{
    const text=e.textContent;
    const sent=text.match(/您的附件简历\s+(.+?)\s+已发送给Boss/);
    const prefix=sent?.[1].replace(/(?:\.{3}|…)$/,'').trim();
    return text.includes(data.filename) || (prefix && data.filename.startsWith(prefix));
  }).map(e=>({id:e.getAttribute('data-mid'),exact:e.textContent.includes(data.filename),text:e.innerText.slice(0,600),failed:!!e.querySelector('.status-error,.status-fail,.message-fail')}));
  throw new Error('不支持的操作');
}

export async function sendResumeThroughBridge({bridge, version, pdf, previous, save, wait = ms=>new Promise(r=>setTimeout(r,ms))}) {
  const evaluate = async (fn,...args) => {
    const r = await bridge.command('evaluate',{code:`JSON.stringify((${fn.toString()})(${args.map(a=>JSON.stringify(a)).join(',')}))`});
    return typeof r.value==='string' ? JSON.parse(r.value) : r.value;
  };
  const step = (op,data = {}) => evaluate(resumeUiStep,op,data);
  const chat = () => evaluate(readCurrentResumeChat);
  let attempted = false;
  const filename = previous?.filename || resumeUploadFilename(version);
  try {
    const recipient = await chat(); assertResumeRecipient(version,recipient);
    if (['sent','unknown','sending'].includes(previous?.status)) return {status:previous.status==='sent'?'sent':'unknown',filename,message:previous.status==='sent'?'此版本已发送给该收件人，未重复发送。':'此前发送结果待核对，请先检查 BOSS 记录，系统不会重复点击发送。'};
    const poll = async (fn) => { for(let i=0;i<20;i++){const r=await fn();if(r)return r;await wait(500);}return false; };
    const navigate = async url => { try {await bridge.command('navigate',{url,newTab:false});} catch {} };
    // Upload is separate from send. Capacity errors never delete older files.
    await navigate('https://www.zhipin.com/web/geek/resume');
    await poll(async()=> (await step('library')).length>0);
    let library = await step('library');
    if(!library.includes(filename)) {
      if(library.length>=3) throw new Error('BOSS 附件库已满（3份），请先管理附件腾出位置。原始简历不会被自动删除。');
      await step('openUpload');
      if(!await poll(()=>step('uploadReady'))) throw new Error('BOSS 上传窗口尚未就绪，请检查浏览器。');
      await step('upload',{filename,base64:pdf.toString('base64')});
      if(!await poll(()=>step('confirmUpload',{filename}))) throw new Error('BOSS 未显示该文件的上传确认，发送已停止。');
      if(!await poll(async()=> (await step('library')).includes(filename))) {
        await navigate('https://www.zhipin.com/web/geek/resume');
        if(!await poll(async()=> (await step('library')).includes(filename))) throw new Error('尚未确认附件已入库，请检查 BOSS 后重试。');
      }
    }
    await save({status:'uploaded',filename,recipient});
    await navigate('https://www.zhipin.com/web/geek/chat');
    if(!await poll(()=>step('selectChat',recipient))) throw new Error('未找到唯一的原收件人，附件已上传但未发送。');
    if(!await poll(async()=>{const c=await chat();return c?.company===version.company && c?.title===version.title && c?.recruiter===recipient.recruiter;})) throw new Error('未回到对应岗位聊天，未发送。');
    assertResumeRecipient(version,await chat(),recipient);
    const before = await step('evidence',{filename});
    if(before.some(e=>e.exact && !e.failed && e.id && /已发送|送达|已读|已发/.test(e.text))) {const result={status:'sent',filename,recipient,message:'已在聊天记录中确认此附件，未重复发送。'};await save(result);return result;}
    await step('openChooser'); if(!await poll(()=>step('choose',{filename}))) throw new Error('没有找到对应岗位附件，未发送。');
    assertResumeRecipient(version,await chat(),recipient);
    await save({status:'sending',filename,recipient}); attempted=true;
    await step('send',{filename,recipient});
    const evidence=await poll(async()=>{assertResumeRecipient(version,await chat(),recipient);return (await step('evidence',{filename})).find(e=>e.id&&!before.some(old=>old.id===e.id)&&!e.failed&&/已发送|送达|已读|已发/.test(e.text));});
    const result = evidence ? {status:'sent',filename,recipient,message:'已核对当前聊天中的附件发送记录。',messageId:evidence.id} : {status:'unknown',filename,recipient,message:'已点击发送，但尚未取得成功回执。请检查 BOSS 聊天记录，系统不会自动重发。'};
    await save(result);return result;
  } catch(error) {
    const result={status:attempted?'unknown':'blocked',filename,message:attempted?'发送结果待核对，请检查 BOSS 聊天记录，系统不会自动重发。':error.message};
    if(attempted)await save(result);return result;
  }
}
