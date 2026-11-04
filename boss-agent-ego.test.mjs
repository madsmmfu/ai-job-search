import test from 'node:test';
import assert from 'node:assert/strict';
import { createBossEgoAgentBrowser, runEgoScript } from './boss-agent-ego.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
test('requires explicit account and existing space',()=>{
  assert.throws(()=>createBossEgoAgentBrowser({egoSpaceId:10}),/配置/);
});
test('uses selected existing page and preserves account guard without navigation',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ego-adapter-'));
  const scripts=[];
  const browser=createBossEgoAgentBrowser({dataRoot:root,egoSpaceId:10,candidateName:'示例求职者',runScript:async code=>{
    scripts.push(code);
    return code.includes('JSON.stringify(({url:')?{url:'https://www.zhipin.com/web/geek/chat'}:{value:JSON.stringify({url:'https://www.zhipin.com/web/geek/chat',value:{url:'https://www.zhipin.com/web/geek/chat',text:'示例求职者 全部 未读 新招呼 仅沟通 简历 消息'.repeat(6),hasChat:true,messages:[],conversations:[]}})};
  }});
  try {
    const result=await browser.open({headless:false});
    assert.equal(result.status,'ok');
    assert.equal(browser.transport,'ego-lite');
    assert.ok(scripts.every(s=>s.includes('taskSpace(10)')&&s.includes('示例求职者')));
    assert.ok(scripts.every(s=>!s.includes('goto(')&&!s.includes('claimTaskSpace')));
    await browser.close();
  } finally {await fs.rm(root,{recursive:true,force:true});}
});
test('CLI parses marked structured result',{skip:process.env.EGO_LIVE_TEST!=='1'},async()=>{
  const result=await runEgoScript("console.log('__AI_ZHIPIN__'+JSON.stringify({ok:true}));",{cliPath:'ego-browser'});
  assert.equal(result.ok,true);
});
