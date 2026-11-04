import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { createBossAgentBrowser } from './boss-agent-browser.mjs';
import { createBossWebBridge } from './web/src/lib/boss/webbridge.mjs';

const BOSS = 'https://www.zhipin.com';
const isBoss = value => { try { return new URL(value).origin === BOSS; } catch { return false; } };
const missingTab = /no open tab|no tab|has no tab|not found|no active tab|session.*missing/i;

/** Uses the user's actual Edge tab. Closing this adapter only detaches it. */
export function createBossWebBridgeAgentBrowser({ bridge, sessionName = 'ai-zhipin-login-repair', activateEdge = async () => {if(process.platform==='darwin')await promisify(execFile)('/usr/bin/open',['-a','Microsoft Edge'],{timeout:5000});}, ...options } = {}) {
  const transport = bridge ?? createBossWebBridge({ sessionName });
  let currentUrl = 'about:blank';
  let attached = false;
  async function evaluate(fn, arg) {
    if (!attached) throw new Error('Edge 标签页尚未连接');
    const result = await transport.command('evaluate', {
      code: `JSON.stringify((() => ({url:location.href,value:(${fn.toString()})(${JSON.stringify(arg) ?? 'undefined'})}))())`,
    });
    const envelope = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
    if (!envelope || typeof envelope.url !== 'string' || !isBoss(envelope.url)) throw new Error('Edge 当前标签页已离开 BOSS 直聘');
    currentUrl = envelope.url;
    return envelope.value;
  }
  const page = {
    url: () => currentUrl,
    isClosed: () => !attached,
    on: () => {},
    // The core calls goto during open; preserve an existing login/security tab.
    goto: async () => {},
    bringToFront: async () => {
      await transport.command('cdp',{method:'Page.bringToFront',params:{}});
      await transport.command('cdp',{method:'Page.bringToFront',params:{}});
      await activateEdge();
    },
    evaluate,
    locator: selector => ({
      inputValue: () => evaluate(s => {
        const input = document.querySelector(s);
        if (!input || !('value' in input)) throw new Error('输入框不是普通文本框');
        return input.value;
      }, selector),
      innerText: () => evaluate(s => {
        const input = document.querySelector(s);
        if (!input) throw new Error('聊天输入框不存在');
        return input.innerText;
      }, selector),
      fill: async value => {
        if (!attached) throw new Error('Edge 标签页尚未连接');
        await transport.command('fill', { selector, value });
      },
    }),
  };
  const context = {
    pages: () => attached ? [page] : [],
    on: () => {},
    close: async () => { attached = false; },
  };
  const chromium = {
    launchPersistentContext: async (_profile, { headless }) => {
      if (headless) throw new Error('真实 Edge WebBridge 不支持无头模式');
      let existing;
      try {
        const snapshot = await transport.command('snapshot');
        if (isBoss(snapshot.url)) existing = snapshot;
      } catch (error) { if (!missingTab.test(error.message)) throw error; }
      if (!existing) {
        const inventory=await transport.command('list_browser_tabs');
        const candidates=(inventory.tabs||[]).filter(tab=>isBoss(tab.url));
        const active=candidates.filter(tab=>tab.active);
        const chosen=candidates.length===1?candidates[0]:active.length===1?active[0]:null;
        if(chosen)existing=await transport.command('attach_tab',{tabId:chosen.tabId});
        else if(candidates.length>1)throw new Error('有多个 BOSS 页面，请先选中要连接的 Edge 标签。');
      }
      if (!existing) existing = await transport.command('navigate', { url: `${BOSS}/web/geek/chat`, newTab: true, group_title: 'AI直聘登录' });
      if (!isBoss(existing.url)) throw new Error('未连接到 BOSS 直聘标签页');
      currentUrl = existing.url;
      attached = true;
      return context;
    },
  };
  const browser = createBossAgentBrowser({ ...options, chromium });
  return {
    ...browser,
    transport: 'webbridge',
    open: async ({ headless = false } = {}) => {
      if (headless) throw new Error('真实 Edge WebBridge 不支持无头模式');
      return browser.open({ headless: false });
    },
  };
}
