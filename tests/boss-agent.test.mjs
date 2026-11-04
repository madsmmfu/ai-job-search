import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { incomingToHandle,controlAgent,agentStatus,writeJson } from '../boss-agent.mjs';
test('does not reply to an incoming already followed by an outgoing',()=>{
 const a={id:'1',direction:'incoming',text:'hello'};
 assert.equal(incomingToHandle([a]).id,'1');
 assert.equal(incomingToHandle([a,{id:'2',direction:'outgoing',text:'hello'}]),null);
 assert.equal(incomingToHandle([]),null);
});
test('explicit control clears circuit hold, pause persists, and answers are question-scoped',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-agent-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await writeJson(path.join(root,'config/boss-agent.json'),{enabled:false,scopes:[],holdStatus:'blocked',holdMessage:'验证暂停'});
 await writeJson(path.join(root,'data/boss-agent-state.json'),{status:'blocked',events:[],counts:{sent:3},handled:{secret:'not-public'},pending:[{id:'q1',question:'何时面试',resolved:false}]});
 assert.equal((await agentStatus(root)).handled,undefined);
 await controlAgent('start',{},root);let config=JSON.parse(await fs.readFile(path.join(root,'config/boss-agent.json'),'utf8'));assert.equal(config.enabled,true);assert.equal(config.browserMode,"login");assert.equal(config.holdStatus,undefined);const requestId=config.browserRequestId;assert.ok(requestId);await controlAgent('start',{},root);config=JSON.parse(await fs.readFile(path.join(root,'config/boss-agent.json'),'utf8'));assert.notEqual(config.browserRequestId,requestId);
 await controlAgent('finish-login',{},root);config=JSON.parse(await fs.readFile(path.join(root,'config/boss-agent.json'),'utf8'));assert.equal(config.browserMode,'visible');
 await controlAgent('pause',{},root);assert.equal((await agentStatus(root)).enabled,false);
 await controlAgent('resolve',{id:'q1',answer:'周二下午可以'},root);
 assert.equal((await agentStatus(root)).pending[0].operatorAnswer,'周二下午可以');
 await assert.rejects(controlAgent('resolve',{id:'other',answer:'test'},root),/不存在/);
 assert.equal((await agentStatus(root)).counts.sent,3);
});
test('login verification does not enable replies and finishing preserves the browser session',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'boss-login-only-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await writeJson(path.join(root,'config/boss-agent.json'),{enabled:false,scopes:[]});
 await controlAgent('login',{},root);const before=JSON.parse(await fs.readFile(path.join(root,'config/boss-agent.json'),'utf8'));
 assert.equal(before.enabled,false);assert.equal(before.loginRequested,true);
 await controlAgent('finish-login',{},root);const after=JSON.parse(await fs.readFile(path.join(root,'config/boss-agent.json'),'utf8'));
 assert.equal(after.enabled,false);assert.equal(after.browserRequestId,before.browserRequestId);assert.equal(after.browserMode,'visible');
 await controlAgent('pause',{},root);assert.equal((await agentStatus(root)).loginRequested,false);
});
