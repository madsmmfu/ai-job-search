import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {readBossDom} from '../../src/lib/boss/dom.mjs';
test('current Boss cards extract clean title, company and Hangzhou location',async(t)=>{
 let browser;try{browser=await chromium.launch({channel:'chrome',headless:true});}catch{t.skip('Chrome not installed');return;}
 try{const page=await browser.newPage();await page.setContent('<ul><li class="job-card-box"><div class="job-title"><a class="job-name" href="/job_detail/test123.html">AI内容运营</a><span class="job-salary">15-25K</span></div><ul class="tag-list"><li>3-5年</li><li>本科</li></ul><div class="job-card-footer"><a class="boss-info"><span class="boss-name">示例公司</span></a><span class="company-location">杭州·滨江区</span></div></li></ul>');const d=await page.evaluate(readBossDom);assert.equal(d.cards[0].title,'AI内容运营');assert.equal(d.cards[0].company,'示例公司');assert.equal(d.cards[0].location,'杭州·滨江区');assert.equal(d.cards[0].salary,'15-25K');}finally{await browser.close();}
});
