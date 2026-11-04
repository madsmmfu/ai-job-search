import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, stat, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBossAgentBrowser, sameRecipient, latestIncoming, bossAgentDom } from '../boss-agent-browser.mjs';

const target = { company: '授权公司', title: '海外运营', recruiter: '李女士', url: 'https://www.zhipin.com/job_detail/abc.html' };
const incoming = { id: 'in1', direction: 'incoming', text: '请介绍相关经验', delivery: 'received' };
async function harness(t, { delivery = 'sent', alterOnSend = false, throwOnSend = false, draft = '', messages = [incoming], executablePath, allowlist = [target] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'boss-agent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = [];
  const navigationListeners = [];
  let time = 0;
  const mainFrame = { url: () => current.url };
  let current = { url: 'https://www.zhipin.com/web/geek/chat', text: '', hasChat: true, recipient: target,
    conversations: [{ ...target }, { company: '无关公司', title: '无关职位', recruiter: '他人' }], messages: [...messages] };
  const input = { inputValue: async () => draft, fill: async text => { draft = text; calls.push(['fill', text]); } };
  const page = {
    isClosed: () => false, url: () => current.url,
    mainFrame: () => mainFrame,
    on: (event, fn) => { if (event === 'framenavigated') navigationListeners.push(fn); },
    bringToFront: async () => { calls.push(['front']); },
    getByText: () => ({count: async () => 1, isVisible: async () => true, click: async () => { calls.push(['scan-login']); }}),
    goto: async url => { calls.push(['goto', url]); }, locator: () => input,
    evaluate: async (fn, args) => {
      if (args.op === 'send') {
        calls.push(['send', args]);
        if (alterOnSend) throw new Error('recipient changed');
        current.messages.push({ id: 'out1', direction: 'outgoing', text: args.text.trim(), delivery });
        if (throwOnSend) throw new Error('response lost');
        return { attempted: true };
      }
      if (args.op === 'select') { calls.push(['select', args.target]); return true; }
      return structuredClone(current);
    },
  };
  const launches = [];
  const browser = createBossAgentBrowser({ dataRoot: root, allowlist, executablePath, chromium: {
    launchPersistentContext: async (...args) => {
      launches.push(args); const closeListeners = [];
      return { pages: () => [page], close: async () => { calls.push(['close']); closeListeners.forEach(fn => fn()); }, on: (event, fn) => { if (event === 'close') closeListeners.push(fn); } };
    },
  }, wait: async () => {}, now: () => time });
  return { browser, calls, launches, root, set: data => { current = { ...current, ...data }; },
    advance: ms => { time += ms; },
    navigate: (url, subframe = false) => {
      if (!subframe) current.url = url;
      navigationListeners.forEach(fn => fn(subframe ? { url: () => url } : mainFrame));
    },
  };
}

test('recipient comparison requires all three exact fields and latest incoming ignores outgoing', () => {
  assert.equal(sameRecipient(target, { ...target }), true);
  for (const key of ['company', 'recruiter', 'title']) {
    assert.equal(sameRecipient(target, { ...target, [key]: '' }), false);
    assert.equal(sameRecipient(target, { ...target, [key]: '不同' }), false);
  }
  assert.equal(latestIncoming([incoming, { id: 'out', direction: 'outgoing' }]), incoming);
});
test('dedicated persistent Edge profile uses private permissions and switches mode only explicitly', async t => {
  const h = await harness(t);
  assert.equal((await h.browser.status()).status, 'login_required');
  assert.equal((await h.browser.open()).status, 'ok');
  const [profile, options] = h.launches[0];
  assert.equal(profile, path.join(h.root, '.career-ops-web', 'edge-agent-profile'));
  assert.equal((await stat(profile)).mode & 0o777, 0o700);
  assert.equal(options.channel, 'msedge');
  assert.equal(options.executablePath, undefined);
  assert.equal(options.headless, true);
  assert.equal(options.chromiumSandbox, true);
  assert.equal(options.storageState, undefined);
  await h.browser.open({ headless: false });
  assert.equal(h.launches.length, 2);
  assert.equal(h.launches[1][1].headless, false);
  assert.equal(h.calls.filter(c => c[0] === 'front').length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'scan-login').length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'goto').at(-1)[1], 'https://www.zhipin.com/web/geek/chat');
  await h.browser.close();
});
test('login/challenge status matches existing parser and never treats empty page as authenticated', async t => {
  for (const [data, status] of [
    [{ text: '扫码登录', hasChat: false }, 'login_required'],
    [{ text: '安全验证', hasChat: true }, 'blocked'],
    [{ text: '', hasChat: false }, 'starting'],
    [{ url: 'https://example.com/login',text:'请先登录' }, 'login_required'],
  ]) { const h = await harness(t); await h.browser.open(); h.set(data); assert.equal((await h.browser.status()).status, status); }
});
test('list only returns explicit allowlist and read rejects wrong identity', async t => {
  const h = await harness(t); await h.browser.open();
  assert.deepEqual(await h.browser.listConversations(), [target]);
  await assert.rejects(h.browser.readThread({ ...target, company: '无关公司' }), /授权/);
  await assert.rejects(h.browser.readThread({ ...target, recruiter: '其他人' }), /授权/);
  h.set({ recipient: { ...target, title: '其他岗位' } });
  await assert.rejects(h.browser.readThread(target), /不匹配/);
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 0);
});
test('no allowlist means no contacts and no sends', async t => {
  const h = await harness(t); await h.browser.open();
  const b = createBossAgentBrowser({ allowlist: [] });
  await assert.rejects(b.readThread(target), /授权/);
  assert.throws(() => createBossAgentBrowser({ allowlist: [{ ...target, url: 'https://evil.example/job_detail/a.html' }] }), /BOSS/);
});
test('send requires unchanged latest incoming and refuses pre-existing drafts', async t => {
  const h = await harness(t, { draft: '用户草稿' }); await h.browser.open();
  await assert.rejects(h.browser.sendReply(target, '回复', { expectedIncomingId: 'old' }), /最新消息/);
  await assert.rejects(h.browser.sendReply(target, '回复', { expectedIncomingId: 'in1' }), /草稿/);
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 0);
});
test('existing reply after latest incoming prevents duplicate sending', async t => {
  const h = await harness(t, { messages: [incoming, { id: 'sent', direction: 'outgoing', text: '已有回复', delivery: 'sent' }] });
  await h.browser.open();
  await assert.rejects(h.browser.sendReply(target, '回复', { expectedIncomingId: 'in1' }), /已有回复/);
  assert.equal(h.calls.filter(c => c[0] === 'fill').length, 0);
});
test('one click and actual delivered message id required for sent result', async t => {
  const h = await harness(t); await h.browser.open();
  const result = await h.browser.sendReply(target, '真实回复', { expectedIncomingId: 'in1' });
  assert.equal(result.status, 'sent'); assert.equal(result.messageId, 'out1');
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 1);
});
test('lost send response, changed identity, pending or absent marker never retried or reported sent', async t => {
  for (const options of [{ throwOnSend: true }, { alterOnSend: true }, { delivery: 'unknown' }, { delivery: 'pending' }]) {
    const h = await harness(t, options); await h.browser.open();
    assert.equal((await h.browser.sendReply(target, '回复', { expectedIncomingId: 'in1' })).status, 'unknown');
    assert.equal(h.calls.filter(c => c[0] === 'send').length, 1);
  }
});
test('explicit failure is not sent or retried', async t => {
  const h = await harness(t, { delivery: 'failed' }); await h.browser.open();
  assert.equal((await h.browser.sendReply(target, '回复', { expectedIncomingId: 'in1' })).status, 'failed');
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 1);
});

function element(text, { classes = '', id = '', selectors = {}, children = [], tagName = 'DIV' } = {}) {
  return { textContent: text, innerText: text, children, tagName, className: classes,
    classList: { contains: c => classes.split(' ').includes(c) },
    getAttribute: key => key === 'data-mid' ? id : null,
    querySelector: selector => selectors[selector] || null,
    querySelectorAll: selector => selectors[selector] || [],
  };
}
test('DOM reader excludes system/cards/unidentified messages and distinguishes delivery', () => {
  const fixture = (classes, id, text, marker) => element(text, { classes, id, selectors: { '.text-content': text ? element(text) : null, ...marker } });
  const items = [fixture('item-friend', 'i1', '问题'), fixture('item-myself', 'o1', '答复', { '.status-delivery': {} }),
    fixture('item-myself', 'o2', '未知'), fixture('item-system', 's1', '系统提示'), fixture('item-friend', '', '无标识'), fixture('item-myself', 'card1', ''),
    fixture('item-myself', 'o3', '失败', { '.status-error,.status-fail,.message-fail': {} })];
  const root = element('', { selectors: { '.chat-record .message-item': items } });
  const oldDoc = globalThis.document, oldLocation = globalThis.location;
  globalThis.document = { body: { innerText: '聊天' }, querySelector: s => s === '.chat-conversation' ? root : null, querySelectorAll: () => [] };
  globalThis.location = { href: 'https://www.zhipin.com/web/geek/chat', origin: 'https://www.zhipin.com', pathname: '/web/geek/chat' };
  try {
    const result = bossAgentDom();
    assert.deepEqual(result.messages.map(m => [m.id, m.delivery]), [['i1', 'received'], ['o1', 'sent'], ['o2', 'unknown'], ['o3', 'failed']]);
    assert.throws(() => bossAgentDom({ op: 'send', target, expectedIncomingId: 'i1', text: '答复' }), /收件人/);
  } finally { globalThis.document = oldDoc; globalThis.location = oldLocation; }
});
test('renderer revalidates identity, latest inbound, new outbound and exact draft before its single click', () => {
  let clicks = 0;
  const info = element('', { children: [element(target.company, { tagName: 'SPAN' })] });
  const message = (id, direction, text) => element(text, { id, classes: direction === 'incoming' ? 'item-friend' : 'item-myself', selectors: { '.text-content': element(text) } });
  const items = [message('in1', 'incoming', '问题')];
  const root = element('', { selectors: { '.base-info': info, '.base-info .name-text': element(target.recruiter), '.position-name': element(target.title), '.chat-record .message-item': items } });
  const input = { innerText: '回复' };
  const button = { className: 'btn-send', click: () => { clicks++; } };
  const selectors = { '.chat-conversation': root, '#chat-input': input, '.chat-editor .btn-send': button };
  const oldDoc = globalThis.document, oldLocation = globalThis.location;
  globalThis.document = { body: { innerText: '' }, querySelector: s => selectors[s] || null, querySelectorAll: () => [] };
  globalThis.location = { href: 'https://www.zhipin.com/web/geek/chat', origin: 'https://www.zhipin.com', pathname: '/web/geek/chat' };
  const args = { op: 'send', target, text: '回复', expectedIncomingId: 'in1', previousIds: ['in1'] };
  try {
    assert.throws(() => bossAgentDom({ ...args, expectedIncomingId: 'old' }), /最新消息/);
    assert.throws(() => bossAgentDom({ ...args, target: { ...target, company: '他人公司' } }), /收件人/);
    items.push(message('other-out', 'outgoing', '人工回复'));
    assert.throws(() => bossAgentDom(args), /已发消息/);
    items.pop(); input.innerText = '另一草稿';
    assert.throws(() => bossAgentDom(args), /内容或按钮/);
    input.innerText = '回复'; button.disabled = true;
    assert.throws(() => bossAgentDom(args), /内容或按钮/);
    button.disabled = false;
    assert.equal(clicks, 0);
    assert.deepEqual(bossAgentDom(args), { attempted: true });
    assert.equal(clicks, 1);
  } finally { globalThis.document = oldDoc; globalThis.location = oldLocation; }
});

test('headless first security navigation closes own context and blocked survives close/status polling', async t => {
  const h = await harness(t); await h.browser.open();
  h.navigate('https://www.zhipin.com/web/passport/zp/security.html');
  assert.equal(h.calls.filter(c => c[0] === 'close').length, 1);
  assert.equal((await h.browser.status()).status, 'blocked');
  await h.browser.close();
  for (let i = 0; i < 4; i++) assert.equal((await h.browser.status()).status, 'blocked');
  await assert.rejects(h.browser.listConversations(), /安全验证/);
  await assert.rejects(h.browser.readThread(target), /安全验证/);
  assert.equal(h.launches.length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'goto').length, 1);
  // Only an explicit user open resets the breaker; headed mode uses login URL.
  h.set({ url: 'https://www.zhipin.com/web/user/', text: '扫码登录', hasChat: false });
  assert.equal((await h.browser.open({ headless: false })).status, 'login_required');
  assert.equal(h.launches.length, 2);
  assert.equal(h.calls.filter(c => c[0] === 'goto').at(-1)[1], 'https://www.zhipin.com/web/geek/chat');
});
test('repeated navigation closes headless but preserves visible verification window', async t => {
  for (const headless of [true, false]) {
    const h = await harness(t); await h.browser.open({ headless });h.set({hasChat:false,text:'准备安全验证'});
    for (let i = 0; i < 4; i++) { h.navigate('https://www.zhipin.com/' + (i % 2 ? 'web/geek/jobs' : '')); h.advance(1500); }
    assert.equal(h.calls.filter(c => c[0] === 'close').length, 0);
    h.navigate('https://www.zhipin.com/');
    assert.equal(h.calls.filter(c => c[0] === 'close').length, headless ? 1 : 0);
    const status = await h.browser.status(); assert.equal(status.status, 'blocked'); assert.match(status.message, /刷新循环|保留验证窗口/);
    h.navigate('https://www.zhipin.com/web/geek/jobs');
    assert.equal((await h.browser.status()).status, 'blocked');
    assert.equal(h.launches.length, 1);
    assert.equal(h.calls.filter(c => c[0] === 'goto').length, 1);
  }
});
test('slow navigation and subframe events do not trigger main-frame loop breaker; repeated open does not navigate', async t => {
  const h = await harness(t); await h.browser.open();
  for (let i = 0; i < 10; i++) h.navigate('https://www.zhipin.com/web/passport/zp/security.html', true);
  assert.equal(h.calls.filter(c => c[0] === 'close').length, 0);
  for (let i = 0; i < 10; i++) { h.navigate('https://www.zhipin.com/web/geek/chat'); h.advance(21000); }
  assert.equal((await h.browser.status()).status, 'ok');
  await h.browser.open();
  assert.equal(h.launches.length, 1);
  assert.equal(h.calls.filter(c => c[0] === 'goto').length, 1);
});
test('headless challenge found in page text closes context and cannot be cleared by read or status', async t => {
  const h = await harness(t); await h.browser.open();
  h.set({ text: '访问过于频繁，请完成验证' });
  assert.equal((await h.browser.status()).status, 'blocked');
  assert.equal(h.calls.filter(c => c[0] === 'close').length, 1);
  h.set({ text: '', hasChat: true });
  assert.equal((await h.browser.status()).status, 'blocked');
  assert.equal(h.launches.length, 1);
});
test('authenticated empty chat is recognized while a loading placeholder is not', () => {
 const oldDoc=globalThis.document,oldLocation=globalThis.location;
 globalThis.document={body:{innerText:'与您进行过沟通的 Boss 都会在左侧列表中显示'},querySelector:()=>null,querySelectorAll:()=>[]};
 globalThis.location={href:'https://www.zhipin.com/web/geek/chat',pathname:'/web/geek/chat'};
 try{assert.equal(bossAgentDom().hasChat,true);globalThis.document.body.innerText='加载中，请稍后';assert.equal(bossAgentDom().hasChat,false);}finally{globalThis.document=oldDoc;globalThis.location=oldLocation;}
});

test('explicit Edge executable takes precedence over installed browser channel', async t => {
  const h = await harness(t, { executablePath: 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe' });
  await h.browser.open();
  assert.equal(h.launches[0][1].executablePath, 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe');
  assert.equal(h.launches[0][1].channel, undefined);
  await h.browser.close();
});

test('missing configured recruiter binds only one exact live company and job', async t => {
  const h = await harness(t, { allowlist: [{ ...target, recruiter: '' }] }); await h.browser.open();
  const request = { ...target }; delete request.recruiter;
  assert.equal((await h.browser.readThread(request)).recipient.recruiter, target.recruiter);
  h.set({ recipient: { ...target, title: '不同岗位' } });
  await assert.rejects(h.browser.readThread(request), /唯一匹配/);
});
test('multiple matching visible chats fail closed without preconfigured recruiter', async t => {
  const h = await harness(t, { allowlist: [{ ...target, recruiter: '' }] }); await h.browser.open();
  h.set({ conversations: [target, target] });
  await assert.rejects(h.browser.readThread({ ...target, recruiter: '' }), /唯一匹配/);
  assert.equal(h.calls.filter(c => c[0] === 'send').length, 0);
});
