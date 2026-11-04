import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readBossSearchUntilReady} from '../../src/lib/boss/webbridge.mjs';
const url='https://www.zhipin.com/web/geek/jobs?query=AI&city=101210100';
test('waits for current SPA job cards without another navigation',async()=>{let calls=0;const d=await readBossSearchUntilReady(async()=>({url,status:{status:++calls<3?'error':'ok'},cards:calls<3?[]:[{title:'AI'}]}),url,async()=>{});assert.equal(calls,3);assert.equal(d.cards.length,1);});
test('stops immediately at verification or a different query',async()=>{for(const status of ['blocked','login_required']){let calls=0;await readBossSearchUntilReady(async()=>{calls++;return {url,status:{status}}},url,async()=>assert.fail('must stop'));assert.equal(calls,1);}await readBossSearchUntilReady(async()=>({url:url.replace('query=AI','query=old'),status:{status:'error'}}),url,async()=>assert.fail('must not poll stale query'));});
