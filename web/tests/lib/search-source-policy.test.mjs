import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bossOnlySearch,bossOnlyResponse} from '../../src/lib/search-source-policy.mjs';
test('single-source edition opts in explicitly and rejects overseas discovery',async()=>{
 assert.equal(bossOnlySearch({}),false);
 assert.equal(bossOnlySearch({CAREER_OPS_SEARCH_SOURCE:'boss'}),true);
 assert.equal(bossOnlySearch({CAREER_OPS_SEARCH_SOURCE:'other'}),false);
 const r=bossOnlyResponse();assert.equal(r.status,409);assert.equal((await r.json()).code,'BOSS_ONLY');
});
