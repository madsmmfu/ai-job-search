import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { getCareerOpsRoot } from './path-resolver.mjs';

export function canonicalJobUrl(value) {
  try { const u = new URL(value); return u.origin === 'https://www.zhipin.com' && /^\/job_detail\/[A-Za-z0-9_-]+\.html$/.test(u.pathname) && !u.username && !u.password ? u.origin + u.pathname : null; } catch { return null; }
}
export function parseSalary(text, verified = true) {
  if (!verified || typeof text !== 'string' || /[\uE000-\uF8FF]|美元|美金|USD|港币|HKD|日薪|时薪|\/天|\/时|面议|底薪|提成/i.test(text)) return null;
  const annualPrefix = /^年薪/.test(text.trim());
  const value = text.replace(/^年薪/, '').replace(/[,，\s]/g, '').replace(/[–—~～至]/g, '-');
  const match = value.match(/^(\d+(?:\.\d+)?)(?:([kK]|千|万))?(?:-(\d+(?:\.\d+)?)([kK]|千|万)?)?([kK]|千|万)?(?:元)?(?:\/(月|年)|每(月|年)|([月年])薪)?(?:[·•x×](\d+(?:\.\d+)?)薪)?$/);
  if (!match) return null;
  const [, lo, leftUnit, hi, rightUnit, tailUnit, periodA, periodB, periodC, months] = match;
  const unit = tailUnit || rightUnit || leftUnit;
  if (!unit || tailUnit || (annualPrefix && [periodA,periodB,periodC].includes('月'))) return null;
  const factor = u => u === '万' ? 10000 : 1000;
  const min = Number(lo) * factor(leftUnit || unit), max = Number(hi || lo) * factor(rightUnit || unit);
  const period = annualPrefix || (periodA || periodB || periodC) === '年' ? 'annual' : 'monthly';
  const payMonths = months ? Number(months) : null;
  if (!(min > 0 && max >= min) || (payMonths !== null && (payMonths < 12 || payMonths > 24)) || (period === 'annual' && payMonths)) return null;
  return { currency: 'CNY', period, min, max, midpoint: (min + max) / 2, payMonths, annualized: period === 'monthly' && payMonths ? { min: min * payMonths, max: max * payMonths } : null };
}
function safeText(value, limit = 200) { return typeof value === 'string' ? value.trim().slice(0,limit) : ''; }
export function mergeObservations(previous = [], incoming = []) {
  const all = new Map();
  for (const item of [...previous,...incoming]) {
    const url = canonicalJobUrl(item?.url); if (!url) continue;
    const id = url.match(/\/([^/]+)\.html$/)[1];
    const record = { id,url,title:safeText(item.title),company:safeText(item.company),location:safeText(item.location),salaryText:safeText(item.salaryText),salaryVerified:item.salaryVerified === true,salarySource:safeText(item.salarySource,150),salaryCapturedAt:safeText(item.salaryCapturedAt || item.capturedAt,50),capturedAt:safeText(item.capturedAt,50),keyword:safeText(item.keyword),requirements:safeText(item.requirements,40000),experience:safeText(item.experience),education:safeText(item.education) };
    const existing = all.get(id);
    if (existing) {
      if (!parseSalary(record.salaryText,record.salaryVerified) && parseSalary(existing.salaryText,existing.salaryVerified)) { record.salaryText=existing.salaryText;record.salaryVerified=existing.salaryVerified;record.salarySource=existing.salarySource;record.salaryCapturedAt=existing.salaryCapturedAt; }
      if (!record.requirements) record.requirements=existing.requirements;
    }
    all.set(id,record);
  }
  return [...all.values()];
}
export function roleFor(title) {
  const senior = /负责人|总监|主管|经理|head|director|manager/i.test(title) ? ' · 管理岗' : /专员|助理|实习/i.test(title) ? ' · 执行岗' : '';
  if (/海外|跨境|国际|global|international/i.test(title)) return '海外内容与增长' + senior;
  if (/AI|AIGC|人工智能/i.test(title)) return 'AI 内容运营' + senior;
  if (/负责人|总监|经理|主管|head|manager/i.test(title)) return '内容管理与负责人' + senior;
  return '内容与新媒体运营';
}
export function summarize(values) {
  if (!values.length) return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const q = p => { const i=(sorted.length-1)*p,l=Math.floor(i);return Math.round(sorted[l]+(sorted[Math.min(l+1,sorted.length-1)]-sorted[l])*(i-l)); };
  return {min:sorted[0],q1:q(.25),median:q(.5),q3:q(.75),max:sorted.at(-1)};
}
const SKILLS = [
  ['AI 内容生产',/\bAI\b|AIGC|人工智能|智能体/i],['海外平台',/TikTok|YouTube|Twitter|Discord|Instagram|Facebook|海外社媒/i],
  ['英语',/英文|英语|English/i],['团队管理',/团队|管理|带领|负责人|总监/i],['矩阵运营',/矩阵|多账号|多帐号/i],
  ['增长与转化',/增长|转化|获客|线索|GMV|ROI/i],['数据复盘',/数据|复盘|分析/i],['短视频内容',/短视频|脚本|视频剪辑|视频内容/i],
  ['流程与 SOP',/SOP|流程|工作流|标准化/i],['电商运营',/电商|带货|店铺|TikTok Shop/i],['达人合作',/KOL|KOC|达人|红人/i]
];
export function buildMarketReport(data = {}, cv = '') {
  const jobs=mergeObservations([],data.observations || []).map(item=>({...item,role:roleFor(item.title),parsedSalary:parseSalary(item.salaryText,item.salaryVerified)}));
  const monthly=jobs.filter(j=>j.parsedSalary?.period==='monthly'), annual=jobs.filter(j=>j.parsedSalary?.period==='annual');
  const roles=[...new Set(jobs.map(j=>j.role))].map(role=>{const subset=jobs.filter(j=>j.role===role),valid=subset.filter(j=>j.parsedSalary?.period==='monthly');return {role,count:subset.length,monthlyMedian:summarize(valid.map(j=>j.parsedSalary.midpoint))?.median ?? null,validSalaryCount:valid.length};}).sort((a,b)=>b.count-a.count);
  const skills=SKILLS.map(([skill,re])=>{const found=jobs.filter(j=>j.requirements && re.test(j.requirements));return {skill,count:found.length,jobIds:found.map(j=>j.id)};}).filter(x=>x.count).sort((a,b)=>b.count-a.count);
  const cvLines=cv.split(/\r?\n/).map(l=>l.replace(/^\s*[#*•●-]+\s*/, '').trim()).filter(l=>l && !/^来源[：:]/.test(l));
  const evidence=SKILLS.flatMap(([skill,re])=>{const quote=cvLines.find(l=>re.test(l));return quote ? [{skill,quote}] : [];});
  const matched=skills.flatMap(s=>{const e=evidence.find(e=>e.skill===s.skill);return e ? [{...s,quote:e.quote}] : [];});
  const toVerify=skills.filter(s=>!evidence.some(e=>e.skill===s.skill));
  const stats=summarize(monthly.map(j=>j.parsedSalary.midpoint));
  const confidence=monthly.length>=5 && monthly.length / Math.max(1,jobs.length)>=0.5 ? 'moderate' : 'low';
  const perRole=roles.flatMap(r=>{const valid=monthly.filter(j=>j.role===r.role), group=summarize(valid.map(j=>j.parsedSalary.midpoint));return group ? [{role:r.role,count:valid.length,range:[group.q1,group.q3],confidence:valid.length>=5 && valid.length/Math.max(1,r.count)>=0.5?'moderate':'low',evidenceSkills:matched.filter(s=>s.jobIds.some(id=>valid.some(j=>j.id===id))).map(s=>s.skill)}] : [];});
  const evidenceActions=matched.slice(0,3).map(s=>`把「${s.skill}」对应的原简历经历整理为一个案例：${s.quote.slice(0,110)}${s.quote.length>110?'…':''}`);
  const gapActions=toVerify.slice(0,2).map(s=>`核对「${s.skill}」要求（${s.count} 个已读 JD 提到），有经历则补充证据；没有则完成一个小型练习作品。`);
  const portfolioActions=[];
  if(evidence.some(e=>e.skill==='AI 内容生产')) portfolioActions.push('完成一个可演示的 AI 内容流程：选题、脚本、人工校对、发布与复盘。记录实际效果，不预填提效比例。');
  if(evidence.some(e=>e.skill==='海外平台')) portfolioActions.push('围绕一个真实产品制作海外内容样稿和平台分发方案，展示内容判断与本地化思路。');
  return {city:'杭州',collectedAt:data.collectedAt || null,collectionStatus:data.collectionStatus || 'not_collected',collectionMessage:safeText(data.collectionMessage,2000),total:jobs.length,roles,skills,requirementsCount:jobs.filter(j=>j.requirements).length,
    salary:{validCount:monthly.length+annual.length,unknownCount:jobs.length-monthly.length-annual.length,monthlyCount:monthly.length,annualCount:annual.length,monthly:stats,annual:summarize(annual.map(j=>j.parsedSalary.midpoint)),annualized:monthly.filter(j=>j.parsedSalary.annualized).map(j=>({id:j.id,...j.parsedSalary.annualized,payMonths:j.parsedSalary.payMonths})),confidence,note:'统计人民币挂牌薪资区间的中点，不代表实际 offer；月薪与年薪分别统计。仅核验可读薪资进入计算。已知薪数才另算年化；当前是关键词搜索样本，不代表杭州全市场。'},
    career:{source:'cv.md',sourceAvailable:!!cv.trim(),method:'基于原简历与已读岗位需求的关键词证据匹配，表示可用于讲述的经历，不等同于能力测评。待核对表示简历未检出相应证据，不表示缺乏能力。',evidence,matched,toVerify,directions:roles.map(r=>({...r,sampleCount:r.count,evidence:matched.filter(s=>s.jobIds.some(id=>jobs.find(j=>j.id===id)?.role===r.role)).map(s=>({skill:s.skill,quote:s.quote}))})).sort((a,b)=>b.evidence.length-a.evidence.length || b.count-a.count),
      trajectory:[{period:'0–6 个月',title:'确定主线，验证岗位匹配',goal:'选择一个有履历证据支撑的方向，用定制简历和作品获得真实面试反馈。核对职责与固定薪资，再决定是否接受机会。'},{period:'6–18 个月',title:'负责完整的业务闭环',goal:'争取独立负责内容从生产、分发到增长或转化的完整链路，积累可复述、可核对的结果和协作方法。'},{period:'18–36 个月',title:'用结果扩大职责范围',goal:'在已证明的能力上选择专家深化或团队管理路线，以业务结果争取更大责任。具体进展取决于工作机会和实际表现。'}],
      plan:[{days:'30',title:'整理可验证的能力证据',actions:evidenceActions.length ? evidenceActions : ['把原简历中的成果整理成案例，保留项目背景、个人职责、过程和结果。','对照已采集的岗位逐项核对需求，补充尚未确认的能力证据。']},{days:'60',title:'用作品补齐目标岗位的表达',actions:[...gapActions,...portfolioActions,'选一个目标岗位需求制作可展示的小型作品，记录工具、流程和效果。','按岗位定制简历中的经历重点，并用真实反馈修改案例表达。']},{days:'90',title:'根据面试反馈调整方向',actions:['复盘沟通、面试和薪资反馈，区分岗位要求与自身偏好。','补采同层级、同职责的杭州岗位，再调整目标方向和薪资区间。']}],
      salaryAdvice:{range:perRole.length===1 ? perRole[0].range : null,stretch:perRole.length===1 ? perRole[0].range[1] : null,confidence:perRole.some(r=>r.confidence==='moderate')?'moderate':'low',perRole,basis:stats ? `已按岗位方向及标题中的管理/执行标记分组，分别参考已核验挂牌月薪区间中点的第 25–75 百分位。每组少于 5 个为低置信度，仅供面试探索；同组仍可能混合资历，不能视为个人估值或承诺。具体期望需核对职责、固定薪资、提成和薪数。` : '尚无可用月薪样本，请先采集并核验薪资；不凭空给出期望工资。'}},observations:jobs};
}
async function readJson(file) { try { return JSON.parse(await fs.readFile(file,'utf8')); } catch(e) { if(e.code==='ENOENT') return null;throw e; } }
export async function loadMarket(root=getCareerOpsRoot()) {
  const data=await readJson(path.join(root,'data/boss-market.json')) || {observations:[]};
  if (!Array.isArray(data.observations)) throw new Error('市场数据格式损坏，请检查 data/boss-market.json。');
  let cv='';try {cv=await fs.readFile(path.join(root,'cv.md'),'utf8');} catch(e) {if(e.code!=='ENOENT') throw e;}
  return buildMarketReport(data,cv);
}
export async function saveMarket(input,root=getCareerOpsRoot()) {
  const file=path.join(root,'data/boss-market.json'),current=await readJson(file) || {observations:[]};
  if (!Array.isArray(current.observations) || !Array.isArray(input.observations)) throw new Error('市场数据格式无效。');
  const observations=mergeObservations(current.observations,input.observations);
  for (const item of observations) if (!item.requirements) {
    const research=await readJson(path.join(root,'documents/boss-research',item.id+'.json'));
    if (research && typeof research.text==='string') item.requirements=research.text.slice(0,40000);
  }
  const data={city:'杭州',observations,collectedAt:input.collectedAt || new Date().toISOString(),collectionStatus:input.collectionStatus || 'ok',collectionMessage:safeText(input.collectionMessage,2000)};
  await fs.mkdir(path.dirname(file),{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';
  try {await fs.writeFile(temp,JSON.stringify(data,null,2)+'\n',{mode:0o600});await fs.rename(temp,file);} finally {await fs.rm(temp,{force:true});}
  return loadMarket(root);
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {const action=process.argv[2] || 'report';let result;if(action==='save'){let text='';for await(const chunk of process.stdin)text+=chunk;result=await saveMarket(JSON.parse(text));}else if(action==='report') result=await loadMarket();else throw new Error('无效的市场分析操作。');process.stdout.write(JSON.stringify(result));} catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
