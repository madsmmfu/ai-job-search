import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {parseSalary,mergeObservations,buildMarketReport,saveMarket,loadMarket} from '../boss-market.mjs';
const job=(id,more={})=>({id,url:`https://www.zhipin.com/job_detail/${id}.html?securityId=secret`,title:'海外内容运营',company:'公司',location:'杭州',salaryText:'15-25K·16薪',salaryVerified:true,...more});
test('parses monthly K and 万 units with explicit annualization only',()=>{
 assert.deepEqual(parseSalary('15–25K·16薪'),{currency:'CNY',period:'monthly',min:15000,max:25000,midpoint:20000,payMonths:16,annualized:{min:240000,max:400000}});
 assert.equal(parseSalary('1.5-2.5万/月').midpoint,20000);
 assert.equal(parseSalary('15K-2万/月').max,20000);
 assert.equal(parseSalary('15-25K').annualized,null);
});
test('annual salaries kept separate; unknown and foreign/ambiguous units excluded',()=>{
 assert.equal(parseSalary('30-50万/年').period,'annual');
 assert.equal(parseSalary('年薪30-50万').midpoint,400000);
 for(const text of ['\ue001-\ue002K','面议','15-25K美元','200-300元/天','15-25','15K+提成','10-30K底薪','15-25K·5薪','15K万','年薪15-25K/月'])assert.equal(parseSalary(text),null,text);
 assert.equal(parseSalary('15-25K',false),null);
});
test('deduplicates by canonical URL and preserves verified salary when refreshed unreadable',()=>{
 const merged=mergeObservations([job('one',{requirements:'需要英语',salarySource:'人工截图核验',capturedAt:'before'})],[job('one',{salaryText:'',salaryVerified:false,salarySource:'新查询不可读',capturedAt:'later'})]);
 assert.equal(merged.length,1);assert.equal(merged[0].salaryText,'15-25K·16薪');assert.equal(merged[0].requirements,'需要英语');
 assert.equal(merged[0].salarySource,'人工截图核验');assert.equal(merged[0].salaryCapturedAt,'before');
 assert.equal(merged[0].url,'https://www.zhipin.com/job_detail/one.html');
 assert.deepEqual(mergeObservations([],[{url:'https://evil.com/job_detail/x.html'}]),[]);
});
test('salary stats exclude unknown and annual salaries; sample confidence explicit',()=>{
 const report=buildMarketReport({observations:[job('a'),job('b',{salaryText:'面议'}),job('c',{salaryText:'30-50万/年'})]});
 assert.equal(report.salary.monthlyCount,1);assert.equal(report.salary.annualCount,1);assert.equal(report.salary.unknownCount,1);assert.equal(report.salary.monthly.median,20000);assert.equal(report.salary.confidence,'low');
 assert.equal(buildMarketReport({observations:Array.from({length:5},(_,i)=>job('a'+i))}).salary.confidence,'moderate');
 assert.equal(buildMarketReport({observations:[...Array.from({length:5},(_,i)=>job('v'+i)),...Array.from({length:20},(_,i)=>({...job('u'+i),salaryText:'',salaryVerified:false}))]}).salary.confidence,'low');
});
test('skills derive solely from available requirement text; candidate quotes trace exactly to cv',()=>{
 const cv='# 求职者\n● 管理团队并使用 AI 内容工具\n● 熟悉 TikTok\n';
 const report=buildMarketReport({observations:[job('a',{requirements:'要求英语和 AI 内容生产'}),job('b',{title:'英语海外运营'})]},cv);
 assert.equal(report.skills.find(s=>s.skill==='英语').count,1);
 assert.equal(report.career.toVerify.find(s=>s.skill==='英语').count,1);
 assert.ok(report.career.matched.every(s=>cv.includes(s.quote)));
 assert.equal(report.career.source,'cv.md');
 assert.equal(report.requirementsCount,1);
});
test('persistence uses user root and malformed file surfaces instead of empty fallback',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'boss-market-'));
 await writeFile(path.join(root,'cv.md'),'● 使用 AI 内容工具');
 const report=await saveMarket({observations:[job('a')],collectionStatus:'ok'},root);assert.equal(report.total,1);
 const saved=JSON.parse(await readFile(path.join(root,'data/boss-market.json'),'utf8'));assert.ok(!saved.observations[0].url.includes('secret'));
 await writeFile(path.join(root,'data/boss-market.json'),'{broken');await assert.rejects(loadMarket(root));
});

test('individual salary guidance never pools management and execution levels',()=>{
 const report=buildMarketReport({observations:[job('manager',{title:'AI内容运营负责人',salaryText:'30-40K',requirements:'团队管理和AI'}),job('junior',{title:'AI内容运营专员',salaryText:'5-8K',requirements:'AI'})]},'● 带领团队完成 AI 内容工作流');
 assert.equal(report.career.salaryAdvice.range,null);assert.equal(report.career.salaryAdvice.perRole.length,2);
 assert.ok(report.career.salaryAdvice.perRole.every(s=>s.confidence==='low'));
 assert.ok(report.career.directions[0].evidence.length >= report.career.directions[1].evidence.length);
});
