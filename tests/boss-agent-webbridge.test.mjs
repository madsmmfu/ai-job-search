import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBossWebBridgeAgentBrowser } from '../boss-agent-webbridge.mjs';

async function fixture(t, { existing = true, url = 'https://www.zhipin.com/web/geek/chat' } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'boss-bridge-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [];
  const data = { url, text: '已登录聊天页面', hasChat: true, conversations: [], messages: [] };
  const bridge = { command: async (action, args) => {
    calls.push({ action, args });
    if (action === 'snapshot' || action === 'find_tab') {
      if (!existing) throw new Error('no open tab found');
      return { url, tabId: 123 };
    }
    if (action === 'cdp') return {};
    if (action === 'list_browser_tabs') return {tabs:[]};
    if (action === 'navigate') return { url, tabId: 456 };
    if (action === 'evaluate') return { type: 'string', value: JSON.stringify({ url, value: data }) };
    throw new Error('Unexpected browser action: ' + action);
  } };
  return { browser: createBossWebBridgeAgentBrowser({ dataRoot: root, bridge, activateEdge:async()=>{} }), calls, data };
}

test('reuse existing login/security tab without navigation; status only reads', async t => {
  const { browser, calls } = await fixture(t, { url: 'https://www.zhipin.com/web/user/' });
  const opened = await browser.open({ headless: false });
  assert.equal(opened.headless, false);
  await browser.status();
  await browser.status();
  assert.equal(calls.filter(c => c.action === 'navigate').length, 0);
  assert.equal(calls.filter(c => c.action === 'find_tab').length, 0);
  assert.ok(calls.some(c => c.action === 'evaluate'));
});

test('close detaches without closing real Edge tab and status does not reopen', async t => {
  const { browser, calls } = await fixture(t);
  await browser.open();
  await browser.close();
  const count = calls.length;
  assert.equal((await browser.status()).status, 'login_required');
  assert.equal(calls.length, count);
  assert.ok(calls.every(c => !/^close/.test(c.action)));
});

test('new tab is created once only when no existing BOSS tab can be found', async t => {
  const { browser, calls } = await fixture(t, { existing: false });
  await browser.open();
  await browser.open();
  assert.deepEqual(calls.filter(c => c.action === 'navigate').map(c => c.args.newTab), [true]);
});

test('evaluate parses bridge JSON envelope for core status and preserves page url', async t => {
  const { browser, calls } = await fixture(t);
  const result = await browser.open();
  assert.equal(result.status, 'ok');
  assert.equal(result.pageUrl, 'https://www.zhipin.com/web/geek/chat');
  assert.match(calls.find(c => c.action === 'evaluate').args.code, /JSON.stringify/);
});

test('headless request is rejected without any browser operation', async t => {
  const { browser, calls } = await fixture(t);
  await assert.rejects(browser.open({ headless: true }), /不支持无头模式/);
  assert.equal(calls.length, 0);
});

test('bridge session override is scoped and default callers retain existing session', async () => {
  const { createBossWebBridge } = await import('../web/src/lib/boss/webbridge.mjs');
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true, data: { url: 'https://www.zhipin.com' } }) };
  };
  await createBossWebBridge({ fetchImpl, sessionName: 'ai-zhipin-login-repair' }).command('snapshot');
  await createBossWebBridge({ fetchImpl }).command('snapshot');
  assert.deepEqual(requests.map(r => r.session), ['ai-zhipin-login-repair', 'career-ops-boss-edge']);
});
test('generated evaluator executes as a plain expression in the installed bridge',async t=>{
 const {runInNewContext}=await import('node:vm');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-bridge-expression-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const url='https://www.zhipin.com/web/geek/chat';
 const globals={location:{href:url,pathname:'/web/geek/chat'},document:{body:{innerText:'与您进行过沟通的 Boss 都会在左侧列表中显示'},querySelector:()=>null,querySelectorAll:()=>[]}};
 const bridge={command:async(action,args)=>{
  if(action==='snapshot')return {url};if(action==='cdp')return {};
  if(action==='evaluate')return {value:runInNewContext(args.code,globals)};
  throw new Error('unexpected action '+action);
 }};
 const b=createBossWebBridgeAgentBrowser({bridge,dataRoot:root,activateEdge:async()=>{}});
 assert.equal((await b.open()).status,'ok');assert.equal((await b.status()).status,'ok');await b.close();
});
test('recover a lost session by attaching the existing BOSS tab without foreground dependency',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-tab-reattach-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const calls=[];const url='https://www.zhipin.com/web/geek/chat';
 const bridge={command:async(action,args)=>{calls.push({action,args});if(action==='snapshot')throw new Error('session has no tab');if(action==='list_browser_tabs')return {tabs:[{tabId:42,url,active:false},{tabId:9,url:'edge://newtab/',active:true}]};if(action==='attach_tab')return {url,tabId:42};if(action==='cdp')return {};if(action==='evaluate')return {value:JSON.stringify({url,value:{url,text:'已登录聊天页面',hasChat:true,conversations:[],messages:[]}})};throw new Error(action);}};
 const b=createBossWebBridgeAgentBrowser({bridge,dataRoot:root,activateEdge:async()=>{}});assert.equal((await b.open()).status,'ok');assert.deepEqual(calls.find(c=>c.action==='attach_tab').args,{tabId:42});assert.equal(calls.some(c=>c.action==='navigate'||c.action==='find_tab'),false);await b.close();
});
test('HTTP error preserves a missing-tab diagnosis for session recovery',async()=>{
 const {createBossWebBridge}=await import('../web/src/lib/boss/webbridge.mjs');
 const b=createBossWebBridge({fetchImpl:async()=>({ok:false,json:async()=>({ok:false,error:{message:'session has no tab'}})})});
 await assert.rejects(b.command('snapshot'),/session has no tab/);
});
