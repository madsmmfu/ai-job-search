import { sendExistingResume } from './boss-existing-resume.mjs';
import { spawn } from 'node:child_process';
import { createBossWebBridgeAgentBrowser } from './boss-agent-webbridge.mjs';

// One existing, explicitly selected TaskSpace; never reclaim user control or open tabs.
export function runEgoScript(code, { cliPath = 'ego-browser' } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cliPath, ['nodejs'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Ego Lite 操作超时；发送结果不确定时不会自动重试。')); }, 20000);
    child.stdout.on('data', c => { out += c; });
    child.stderr.on('data', c => { err += c; });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error('Ego Lite 连接失败：' + err));
      const line = (out+'\n'+err).split('\n').findLast(l => l.startsWith('__AI_ZHIPIN__'));
      try { resolve(JSON.parse(line.slice('__AI_ZHIPIN__'.length))); } catch { reject(new Error('Ego Lite 未返回有效状态；请检查浏览器控制权。')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(code);
  });
}

export function createBossEgoAgentBrowser({ egoSpaceId, egoPageLabel = 'p3', candidateName, runScript = runEgoScript, ...options } = {}) {
  if (!Number.isSafeInteger(egoSpaceId) || egoSpaceId < 1 || !/^p\d+$/.test(egoPageLabel) || !candidateName) throw new Error('请配置 Ego Lite TaskSpace、聊天标签和求职者姓名。');
  async function command(op, args = {}) {
    let action;
    if (op === 'snapshot') action = '({url:await p.url()})';
    else if (op === 'evaluate') action = `({value:await p.evaluate(${JSON.stringify(args.code)})})`;
    else if (op === 'fill') action = `(await p.fill(${JSON.stringify(args.selector)},${JSON.stringify(args.value)}),{})`;
    else if (op === 'cdp' && args.method === 'Page.bringToFront') action = '{}';
    else throw new Error('Ego Lite 不会自动创建或切换其他 BOSS 标签页。');
    return runScript(`const t=await taskSpace(${egoSpaceId});const p=t.page(${JSON.stringify(egoPageLabel)});const u=await p.url();if(new URL(u).origin!=='https://www.zhipin.com')throw new Error('所选页面不是 BOSS');const n=await p.evaluate(()=>document.querySelector('.nav-figure')?.innerText?.trim()||'');if(n!==${JSON.stringify(candidateName)})throw new Error('BOSS 账号与当前求职者不一致，停止操作');console.log('__AI_ZHIPIN__'+JSON.stringify(${action}));`);
  }
  const core = createBossWebBridgeAgentBrowser({ ...options, bridge: { command }, activateEdge: async () => {} });
  const friendly = result => ({ ...result, message: result.message?.replaceAll('AI直聘专用 Edge', 'Ego Lite').replaceAll('Edge', 'Ego Lite') });
  return { ...core, sendExistingResume: async (target, options) => { const thread=await core.readThread(target);return sendExistingResume({command,recipient:thread.recipient,...options}); }, transport: 'ego-lite', open: async args => friendly(await core.open(args)), status: async () => friendly(await core.status()) };
}
