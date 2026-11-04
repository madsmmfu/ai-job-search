import path from 'node:path';
import fs from 'node:fs/promises';
import { chromium as defaultChromium } from 'playwright';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { bossPageStatus, bossJobUrl } from './web/src/lib/boss/parser.mjs';

const CHAT_URL = 'https://www.zhipin.com/web/geek/chat';
const LOGIN_URL = CHAT_URL;
function isSecurityNavigation(value) {
  try { return /captcha|verify|security(?:[-/_.]|$)/i.test(new URL(value).pathname); } catch { return false; }
}
const normalize = value => typeof value === 'string' ? value.trim() : '';
export function sameRecipient(a, b) {
  return !!a && !!b && ['company', 'title', 'recruiter'].every(k => normalize(a[k]) && normalize(a[k]) === normalize(b[k]));
}
export function latestIncoming(messages) {
  return [...messages].reverse().find(m => m.direction === 'incoming') || null;
}

// Executed only in the rendered page. No cookies, private endpoints or browser
// storage are inspected. List previews and system cards never become messages.
export function bossAgentDom({ op = 'snapshot', target, expectedIncomingId, text, previousIds = [] } = {}) {
  const clean = e => e?.textContent?.trim() || '';
  const root = document.querySelector('.chat-conversation');
  const info = root?.querySelector('.base-info');
  const recipient = root ? {
    recruiter: clean(root.querySelector('.base-info .name-text')),
    company: clean([...(info?.children || [])].find(e => e.tagName === 'SPAN' && !e.className)),
    title: clean(root.querySelector('.position-name')),
  } : null;
  const messages = [...(root?.querySelectorAll('.chat-record .message-item') || [])].flatMap(e => {
    const id = e.getAttribute('data-mid');
    const text = clean(e.querySelector('.text-content'));
    const direction = e.classList.contains('item-friend') ? 'incoming' : e.classList.contains('item-myself') ? 'outgoing' : null;
    if (!id || !text || !direction || e.classList.contains('item-system')) return [];
    const failed = !!e.querySelector('.status-error,.status-fail,.message-fail') || /(?:^|\s)(?:failed|send-fail|message-fail)(?:\s|$)/.test(e.className);
    const pending = !!e.querySelector('.status-loading,.status-sending,.message-loading') || /(?:^|\s)(?:sending|pending)(?:\s|$)/.test(e.className);
    // A server message id plus a delivery marker is required to claim success.
    const delivery = failed ? 'failed' : direction === 'incoming' ? 'received' : pending ? 'pending' : e.querySelector('.status-delivery') ? 'sent' : 'unknown';
    return [{ id, direction, text, delivery }];
  });
  const rows = [...document.querySelectorAll('.chat-user .name-box')];
  const rowIdentity = e => {
    const children = [...e.children].filter(child => child.tagName === 'SPAN');
    return { recruiter: clean(children[0]), company: clean(children[1]), title: '' };
  };
  const exact = (a, b) => !!a && !!b && ['company', 'title', 'recruiter'].every(k => a[k] && a[k] === b[k]);
  if (op === 'select') {
    if (location.origin !== 'https://www.zhipin.com' || location.pathname !== '/web/geek/chat') throw new Error('聊天页面已变化');
    const matches = rows.filter(e => {
      const row = rowIdentity(e);
      return row.company === target.company && row.recruiter === target.recruiter;
    });
    if (matches.length !== 1) throw new Error('未找到唯一的授权联系人');
    matches[0].click();
    return true;
  }
  if (op === 'send') {
    if (location.origin !== 'https://www.zhipin.com' || location.pathname !== '/web/geek/chat' || !exact(recipient, target)) throw new Error('发送前收件人已变化');
    const incoming = [...messages].reverse().find(m => m.direction === 'incoming');
    if (!expectedIncomingId || incoming?.id !== expectedIncomingId) throw new Error('最新消息已变化，停止发送');
    if (messages.some(m => m.direction === 'outgoing' && !previousIds.includes(m.id))) throw new Error('聊天中出现新的已发消息，停止发送');
    const input = document.querySelector('#chat-input');
    const current = input && ('value' in input ? input.value : input.innerText);
    const button = document.querySelector('.chat-editor .btn-send');
    if (current?.trim() !== text.trim() || !button || button.disabled || /disabled|unable/.test(button.className)) throw new Error('发送内容或按钮未就绪');
    button.click();
    return { attempted: true };
  }
  return { url: location.href, text: document.body?.innerText || '', hasChat: !!document.querySelector('.chat-user,.chat-conversation') || (location.pathname === '/web/geek/chat' && /与您进行过沟通的\s*Boss\s*都会在左侧列表中显示/.test(document.body?.innerText || '')), recipient, conversations: rows.map(rowIdentity), messages };
}

export function createBossAgentBrowser({ dataRoot = getCareerOpsRoot(), allowlist = [], chromium = defaultChromium, executablePath, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => Date.now() } = {}) {
  const targets = allowlist.map(target => {
    if (!normalize(target.company) || !normalize(target.title) || !bossJobUrl(target.url)) throw new Error('授权联系人必须包含公司、岗位及 BOSS 岗位链接');
    return { company: normalize(target.company), title: normalize(target.title), recruiter: normalize(target.recruiter), url: bossJobUrl(target.url) };
  });
  let context = null, page = null, headlessMode = null, busy = false;
  let blockedState = null, closing = null, navigations = [], navigationError = null;
  const trip = message => {
    if (blockedState) return;
    blockedState = { status: 'blocked', message };
    if (!headlessMode) return;
    const ownedContext = context;
    context = null; page = null;
    // Closing this context halts BOSS's own JS redirect loop immediately.
    // Do not reset blockedState in the close handler or reopen on a poll.
    if (ownedContext) closing = ownedContext.close().catch(() => {});
  };
  const navigationGuard = (ownedContext, ownedPage, frame) => {
    if (context !== ownedContext || frame !== ownedPage.mainFrame()) return;
    const time = now();
    navigations = navigations.filter(at => time - at < 20000);
    navigations.push(time);
    if (headlessMode && isSecurityNavigation(frame.url())) {
      trip('BOSS 直聘要求安全验证，已关闭专用无头 Edge 并停止访问；请手动重新打开登录。');
    } else if (navigations.length > 4) {
      trip(headlessMode?'BOSS 直聘在 20 秒内连续跳转超过 4 次，已关闭专用 Edge 防止刷新循环；请手动重新打开登录。':'BOSS 出现连续跳转，已停止自动操作并保留验证窗口；请完成验证，系统不会关闭此窗口。');
    }
  };
  const profilePath = path.join(path.resolve(dataRoot), '.career-ops-web', 'edge-agent-profile');
  const permitted = target => {
    const match = targets.find(t => t.company === target?.company && t.title === target?.title && t.url === bossJobUrl(target?.url) && (!t.recruiter || t.recruiter === target.recruiter));
    if (!match || !normalize(target.recruiter)) throw new Error('联系人不在授权列表中或缺少招聘者身份');
    return { ...match, recruiter: normalize(target.recruiter) };
  };
  const snapshot = async () => {
    if (blockedState && headlessMode) throw new Error(blockedState.message);
    const livePages=context?.pages().filter(p=>!p.isClosed()) || [];
    const bossPages=livePages.filter(p=>p.url().startsWith('https://www.zhipin.com/'));
    if (bossPages.length && (!page || page.isClosed() || !page.url().startsWith('https://www.zhipin.com/'))) page=bossPages.at(-1);
    if (!page || page.isClosed()) throw new Error('专用 Edge 尚未打开');
    if (new URL(page.url()).origin !== 'https://www.zhipin.com') return { url: page.url(), text: '', hasChat: false, messages: [], conversations: [] };
    return page.evaluate(bossAgentDom, {});
  };
  const classify = data => {
    if (blockedState && !headlessMode && data.hasChat && !isSecurityNavigation(data.url)) {blockedState=null;navigations=[];}
    if (blockedState) return blockedState;
    if (navigationError && data.url==='about:blank')return {status:'error',message:'专用 Edge 打开页面失败：'+navigationError+'。请重新打开登录。'};
    if ((data.url==='about:blank'||data.url?.startsWith('https://www.zhipin.com/')) && (!data.text?.trim() || (data.text.trim().length<80 && /^(?:加载中|正在加载)/.test(data.text.trim()))) && !data.hasChat && !isSecurityNavigation(data.url)) return {status:'starting',message:'BOSS 页面正在加载，尚未判断登录状态。'};
    const result = bossPageStatus({ url: data.url, text: data.text, hasCards: data.hasChat });
    if (headlessMode && (result.status === 'blocked' || isSecurityNavigation(data.url))) {
      trip('BOSS 直聘要求安全验证，已关闭专用无头 Edge 并停止访问；请手动重新打开登录。');
      return blockedState;
    }
    return result;
  };
  const assertReady = data => { const result = classify(data); if (result.status !== 'ok') throw new Error(result.message); };
  const exclusive = async fn => {
    if (busy) throw new Error('专用 Edge 正在处理请求');
    busy = true;
    try { return await fn(); } finally { busy = false; }
  };
  const resolveTarget = async target => {
    const authorized = targets.filter(t => t.company === target?.company && t.title === target?.title && t.url === bossJobUrl(target?.url));
    if (authorized.length !== 1) throw new Error('联系人不在唯一授权岗位中');
    if (normalize(target.recruiter)) return permitted(target);
    const data = await snapshot(); assertReady(data);
    const candidates = data.conversations.filter(row => row.company === authorized[0].company && normalize(row.recruiter) && (!authorized[0].recruiter || row.recruiter === authorized[0].recruiter));
    const matches = [];
    for (const row of candidates) {
      const candidate = { ...authorized[0], recruiter: row.recruiter };
      try { const thread = await selectThread(candidate); matches.push(thread.recipient); }
      catch (error) { if (!/公司、岗位或招聘者不匹配/.test(error.message)) throw error; }
    }
    if (matches.length !== 1) throw new Error('未找到唯一匹配公司、岗位及招聘者的授权聊天');
    return permitted({ ...authorized[0], ...matches[0] });
  };
  const selectThread = async target => {
    assertReady(await snapshot());
    await page.evaluate(bossAgentDom, { op: 'select', target });
    for (let i = 0; i < 12; i++) {
      const data = await snapshot(); assertReady(data);
      if (sameRecipient(data.recipient, target)) return { recipient: data.recipient, messages: data.messages };
      await wait(250);
    }
    throw new Error('当前聊天的公司、岗位或招聘者不匹配');
  };
  return {
    profilePath,
    open: ({ headless = true } = {}) => exclusive(async () => {
      // This method is an explicit user login/start action. Polling status,
      // listing or reading never clears the circuit breaker or reopens Edge.
      if (closing) { await closing; closing = null; }
      blockedState = null;
      if (context && (headlessMode !== headless || !page || page.isClosed())) { await context.close(); context = null; page = null; }
      if (context) return { ...classify(await snapshot()), headless: headlessMode };
      navigations = [];navigationError=null;
      await fs.mkdir(profilePath, { recursive: true, mode: 0o700 });
      await fs.chmod(profilePath, 0o700);
      const ownedContext = await chromium.launchPersistentContext(profilePath, { ...(executablePath ? { executablePath } : { channel: 'msedge' }), headless, chromiumSandbox: true, viewport: { width: 1440, height: 960 } });
      context = ownedContext;
      headlessMode = headless;
      const ownedPage = ownedContext.pages()[0] || await ownedContext.newPage();
      page = ownedPage;
      ownedPage.on('framenavigated', frame => navigationGuard(ownedContext, ownedPage, frame));
      ownedContext.on('close', () => { if (context === ownedContext) { context = null; page = null; } });
      // A persistent browser may restore a challenged tab before our listener.
      if (headless && isSecurityNavigation(ownedPage.url())) trip('BOSS 直聘要求安全验证，已关闭专用无头 Edge 并停止访问；请手动重新打开登录。');
      if (!blockedState) {
        try { await ownedPage.goto(headless ? CHAT_URL : LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 20000 }); } catch (error) { navigationError=error.message.match(/net::[A-Z_]+|Timeout \d+ms/)?.[0]||error.message.split('\n')[0].slice(0,180); }
      }
      if (!blockedState && page) {
        try { await page.waitForFunction?.(() => { const text=document.body?.innerText?.trim() || ''; return text.length>80 && !/^(加载中|正在加载)/.test(text); }, {}, {timeout:20000}); } catch {}
      }
      if (!headless && !blockedState && page) {
        await page.bringToFront?.();
        const scanLogin = page.getByText?.('扫码登录', { exact: true });
        if (scanLogin && await scanLogin.count() === 1 && await scanLogin.isVisible()) await scanLogin.click();
      }
      if (blockedState) return { ...blockedState, headless: headlessMode };
      try { const data=await snapshot(),result=classify(data);if(!headlessMode&&['login_required','blocked'].includes(result.status)) {try{await page.screenshot?.({path:path.join(dataRoot,'data/boss-agent-login.png'),timeout:3000});}catch{}}return {...result,headless:headlessMode,pageUrl:data.url,pageUrls:context?.pages().map(p=>p.url())}; }
      catch { return blockedState ? { ...blockedState, headless: headlessMode } : { status: 'error', message: '无法读取 AI直聘专用 Edge。' }; }
    }),
    status: async () => {
      if (blockedState && headlessMode) return { ...blockedState, headless: headlessMode };
      if (context?.pages().some(p=>!p.isClosed()&&p.url().startsWith('https://www.zhipin.com/'))) await snapshot().catch(()=>{});
      if (!page || page.isClosed()) return { status: 'login_required', message: '请打开 AI直聘专用 Edge 并独立登录。', headless: headlessMode };
      try { const data=await snapshot(),result=classify(data);if(!headlessMode&&['login_required','blocked'].includes(result.status)) {try{await page.screenshot?.({path:path.join(dataRoot,'data/boss-agent-login.png'),timeout:3000});}catch{}}return {...result,headless:headlessMode,pageUrl:data.url,pageUrls:context?.pages().map(p=>p.url())}; }
      catch { return blockedState ? { ...blockedState, headless: headlessMode } : { status: 'error', message: '无法读取 AI直聘专用 Edge。' }; }
    },
    listConversations: () => exclusive(async () => {
      const data = await snapshot(); assertReady(data);
      return data.conversations.flatMap(row => {
        const matches = targets.filter(t => row.company === t.company && (!row.title || row.title === t.title) && (!t.recruiter || row.recruiter === t.recruiter));
        return matches.length === 1 && row.recruiter ? [{ ...matches[0], recruiter: row.recruiter }] : [];
      });
    }),
    readThread: target => exclusive(async () => selectThread(await resolveTarget(target))),
    sendReply: (target, text, { expectedIncomingId } = {}) => exclusive(async () => {
      const recipient = await resolveTarget(target);
      if (typeof text !== 'string' || !text.trim() || text.length > 1500 || !expectedIncomingId) throw new Error('回复内容或待回复消息标识无效');
      const before = await selectThread(recipient);
      if (latestIncoming(before.messages)?.id !== expectedIncomingId) throw new Error('最新消息已变化，停止发送');
      const incomingIndex = before.messages.findLastIndex(m => m.direction === 'incoming');
      if (before.messages.slice(incomingIndex + 1).some(m => m.direction === 'outgoing')) throw new Error('最新收到消息之后已有回复，停止重复发送');
      const previousIds = before.messages.map(m => m.id);
      const input = page.locator('#chat-input');
      if ((await input.inputValue().catch(() => input.innerText())).trim()) throw new Error('聊天输入框已有草稿，停止发送');
      await input.fill(text);
      // Validate and click atomically in the renderer. A lost response after this
      // point is indeterminate and must never trigger an automatic second click.
      try { await page.evaluate(bossAgentDom, { op: 'send', target: recipient, text, expectedIncomingId, previousIds }); }
      catch { return { status: 'unknown', message: '发送动作结果无法确定，请核对聊天记录；不会自动重试。' }; }
      for (let i = 0; i < 16; i++) {
        let data;
        try { data = await snapshot(); assertReady(data); } catch { return { status: 'unknown', message: '发送后无法读取聊天回执，不会自动重试。' }; }
        if (!sameRecipient(data.recipient, recipient)) return { status: 'unknown', message: '发送后聊天已切换，需人工核对。' };
        const sent = data.messages.find(m => m.direction === 'outgoing' && !previousIds.includes(m.id) && m.text === text.trim());
        if (sent?.delivery === 'sent') return { status: 'sent', messageId: sent.id, recipient };
        if (sent?.delivery === 'failed') return { status: 'failed', messageId: sent.id, message: 'BOSS 显示消息发送失败；不会自动重试。' };
        await wait(500);
      }
      return { status: 'unknown', message: '未获得明确发送回执，不会自动重试。' };
    }),
    close: () => exclusive(async () => {
      if (closing) { await closing; closing = null; }
      if (context) await context.close();
      context = null; page = null;
    }),
  };
}
