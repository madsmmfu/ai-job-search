import { readFileSync, writeFileSync, mkdirSync, renameSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
const exec = promisify(execFile);
const SCRIPT = fileURLToPath(new URL('./scripts/apple-calendar.jxa', import.meta.url));
const DEFAULT = { timezone: 'Asia/Shanghai', city: '', calendarId: '', availability: [], reminders: [1440, 30], defaultDurationMinutes: null, autoConfirmWithinAvailability: false, hermes: { enabled: false, webhookUrl: '', token: '' } };
function load(path, fallback) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return structuredClone(fallback); throw new Error('设置或面试记录损坏，请检查文件，未覆盖原数据。'); } }
function save(path, value) { mkdirSync(dirname(path), {recursive:true}); const tmp = `${path}.${randomUUID()}.tmp`; writeFileSync(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600}); renameSync(tmp,path); chmodSync(path,0o600); }
const settingsPath = root => join(root,'config','interview-settings.json');
const queuePath = root => join(root,'data','boss-interviews.json');
function minute(value) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error('时间必须为 HH:mm。'); const [h,m]=value.split(':').map(Number); return h*60+m; }
export function validateHermesEndpoint(value) {
  if (!value) return '';
  let url; try { url = new URL(value); } catch { throw new Error('Hermes webhook 地址无效。'); }
  const host = url.hostname.toLowerCase();
  const lan = /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host) || host === 'localhost' || host === '[::1]';
  if (url.username || url.password || url.hash || !['https:','http:'].includes(url.protocol) || (url.protocol === 'http:' && !lan)) throw new Error('Hermes 仅支持 HTTPS 或本机/局域网 HTTP 地址，禁止 URL 内嵌密码。');
  return url.href;
}
function validateSettings(input) {
  if (!input || input.timezone !== 'Asia/Shanghai' || typeof input.city !== 'string' || input.city.length>100 || typeof input.calendarId !== 'string' || input.calendarId.length>300 || typeof input.autoConfirmWithinAvailability !== 'boolean' || !Array.isArray(input.availability) || input.availability.length>30 || !Array.isArray(input.reminders) || input.reminders.length>5 || input.reminders.some(n=>!Number.isInteger(n)||n<0||n>10080) || (input.defaultDurationMinutes !== null && (!Number.isInteger(input.defaultDurationMinutes)||input.defaultDurationMinutes<15||input.defaultDurationMinutes>240))) throw new Error('面试设置格式无效。');
  const availability = input.availability.map(w => {
    if(!w || !Array.isArray(w.days) || !w.days.length || w.days.some(d=>!Number.isInteger(d)||d<1||d>7) || typeof w.start!=='string' || typeof w.end!=='string' || minute(w.start)>=minute(w.end)) throw new Error('可面试时段无效，请按星期和同日开始/结束时间设置。');
    return { days:[...new Set(w.days)],start:w.start,end:w.end };
  });
  if (!input.hermes || typeof input.hermes.enabled!=='boolean' || typeof input.hermes.webhookUrl!=='string' || typeof input.hermes.token!=='string' || input.hermes.token.length>2048 || /[\r\n]/.test(input.hermes.token)) throw new Error('Hermes 设置无效。');
  const webhookUrl=validateHermesEndpoint(input.hermes.webhookUrl);
  if(input.hermes.enabled&&!webhookUrl) throw new Error('启用 Hermes 前请填写你自己的 webhook 地址。');
  return { timezone:'Asia/Shanghai',city:input.city.trim(),calendarId:input.calendarId,availability,reminders:[...new Set(input.reminders)],defaultDurationMinutes:input.defaultDurationMinutes,autoConfirmWithinAvailability:input.autoConfirmWithinAvailability,hermes:{enabled:input.hermes.enabled,webhookUrl,token:input.hermes.token} };
}
export function getInterviewSettings(root=getCareerOpsRoot(),{redact=true}={}) {
  const settings=validateSettings(load(settingsPath(root),DEFAULT));
  return redact ? {...settings,hermes:{...settings.hermes,token:'',tokenConfigured:!!settings.hermes.token}} : settings;
}
export async function saveInterviewSettings(root,input) {
  return withPipelineLock(settingsPath(root),async()=>{
    const current=getInterviewSettings(root,{redact:false});
    const candidate={...input,hermes:{...input.hermes,token:input.hermes?.token === '' && !input.hermes?.clearToken ? current.hermes.token : (input.hermes?.token||'')}};
    save(settingsPath(root),validateSettings(candidate));return getInterviewSettings(root);
  });
}
export function parseExplicitDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:\.\d{3})?(?:\+08:00|Z)$/.test(value)) throw new Error('请提供含时区的完整日期时间。');
  const date=new Date(value);
  if(!Number.isFinite(date.getTime())) throw new Error('日期时间不存在。');
  const local=value.endsWith('Z')?date.toISOString().slice(0,16):new Date(date.getTime()+8*3600000).toISOString().slice(0,16);
  if(!Number.isFinite(date.getTime())||local!==value.slice(0,16)) throw new Error('日期时间不存在。');
  return date;
}
export function classifyInterviewInvite(text) {
  const value=String(text||'');
  if(!/面试|interview/i.test(value)) return {isInvite:false,needsUser:false,reason:'非面试邀约'};
  if(/面试经验|面试题|面试培训|面试准备|面试表现|面试过/.test(value)&&!/安排|邀请|邀约|参加|过来|具体时间|面试时间/.test(value))return {isInvite:false,needsUser:false,reason:'讨论面试经验或训练，不视为邀约'};
  if (/(?:\d{1,2}[:：]\d{2}[:：]\d{2}|下午|晚上|凌晨|中午|(?:^|\s)[ap]m\b)/i.test(value)) return {isInvite:true,needsUser:true,reason:'邀约使用含糊时段、12小时制或秒级时间，请本人确认'};
  const dates=[...value.matchAll(/\d{4}[-年/]\d{1,2}[-月/]\d{1,2}/g)];
  const matches=[...value.matchAll(/(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})日?[ T，,]*(\d{1,2})[:：](\d{2})(?:\s*(?:-|~|至|到)\s*(\d{1,2})[:：](\d{2}))?/g)];
  if(matches.length!==1 || dates.length!==1 || /改为|或|二选一|取消|取消面试|ignore.*instruction|忽略.*规则/i.test(value))return{isInvite:true,needsUser:true,reason:'邀约时间不唯一、未写完整日期或涉及变更，需本人确认'};
  const [,y,m,d,h,mi,eh,em]=matches[0];
  const proposedStart=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${mi}+08:00`;
  const result={isInvite:true,needsUser:false,proposedStart,reason:'已识别完整北京时间；仍需时段与日历校验'};
  try {
    parseExplicitDate(proposedStart);
    if(eh){result.proposedEnd=`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${eh.padStart(2,'0')}:${em}+08:00`;if(parseExplicitDate(result.proposedEnd)<=parseExplicitDate(proposedStart))throw new Error();}
  } catch {return{isInvite:true,needsUser:true,reason:'日期或时间无效'};}
  // A foreign timezone or explicit offset is not silently reinterpreted as Shanghai.
  if(/(?:UTC|GMT|\+\d{2}:?\d{2}|T\d{2}:\d{2}-\d{2}:?\d{2}|纽约|伦敦|美国时间|日本时间|\b(?:EST|PST|CST|JST)\b)/i.test(value))return{isInvite:true,needsUser:true,reason:'邀约包含其他或歧义时区，请本人确认北京时间'};
  return result;
}
export function withinAvailability(start,end,settings) {
  const s=parseExplicitDate(start),e=parseExplicitDate(end);if(e<=s||e-s>4*3600000)return false;
  const sh=new Date(s.getTime()+8*3600000),eh=new Date(e.getTime()+8*3600000);
  if(sh.toISOString().slice(0,10)!==eh.toISOString().slice(0,10))return false;
  const day=sh.getUTCDay()||7,from=sh.getUTCHours()*60+sh.getUTCMinutes(),to=eh.getUTCHours()*60+eh.getUTCMinutes();
  return settings.availability.some(w=>w.days.includes(day)&&from>=minute(w.start)&&to<=minute(w.end));
}
export function overlaps(start,end,busy) {const s=+parseExplicitDate(start),e=+parseExplicitDate(end);return busy.some(b=>+new Date(b.start)<e&&+new Date(b.end)>s);}
export async function runAppleCalendar(input, {platform=process.platform, execute=exec}={}) {
  if(platform!=='darwin')throw new Error('Apple 日历仅可在 macOS 上使用。');
  try {const {stdout}=await execute('/usr/bin/osascript',['-l','JavaScript',SCRIPT,JSON.stringify(input)],{timeout:20000,maxBuffer:1024*1024});return JSON.parse(stdout.trim());}
  catch(error){
    const text=String(error.stderr||error.message);
    if(/not authorized|-1743|not permitted/i.test(text))throw new Error('请在系统设置→隐私与安全性→自动化中允许当前服务控制日历。');
    const reason=text.match(/Error: Error: (.+?) \(-\d+\)/)?.[1];
    throw new Error('Apple 日历操作未完成：'+(reason||'请检查所选日历的可用状态。'));
  }
}
export async function notifyHermes(root,invite,{fetchImpl=fetch}={}) {
  const settings=getInterviewSettings(root,{redact:false});
  if(!settings.hermes.enabled)return{status:'disabled',message:'尚未配置 Hermes 通知。'};
  const endpoint=validateHermesEndpoint(settings.hermes.webhookUrl);
  try {
    const response=await fetchImpl(endpoint,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json',...(settings.hermes.token?{Authorization:`Bearer ${settings.hermes.token}`}:{})},body:JSON.stringify({type:'interview_invitation',id:invite.id,company:invite.company,title:invite.title,text:invite.question,proposedStart:invite.proposedStart||null,proposedEnd:invite.proposedEnd||null,message:`AI直聘收到面试邀约：${invite.company} / ${invite.title}。${invite.question}`,timezone:settings.timezone})});
    return response.ok?{status:'sent',message:'Hermes webhook 已接受通知；不代表用户已读。',at:new Date().toISOString()}:{status:'failed',message:`Hermes webhook 返回 HTTP ${response.status}。`};
  }catch{return{status:'unknown',message:'Hermes 请求超时或连接失败，送达状态未知，不自动重复通知。'};}
}
export async function queueInterviewInvite(root,input,dependencies={}) {
  if(!input||typeof input.id!=='string'||!input.id||input.id.length>300||typeof input.company!=='string'||input.company.length>300||typeof input.title!=='string'||input.title.length>300||typeof input.text!=='string'||!input.text.trim()||input.text.length>12000)throw new Error('邀约格式无效。');
  return withPipelineLock(queuePath(root),async()=>{
    const queue=load(queuePath(root),[]);if(!Array.isArray(queue))throw new Error('面试队列格式无效。');
    const existing=queue.find(e=>e.id===input.id);if(existing)return existing;
    const parsed=classifyInterviewInvite(input.text);if(!parsed.isInvite)throw new Error('该消息不是面试邀约。');
    const entry={id:input.id,company:input.company,title:input.title,question:input.text,...parsed,status:'pending',createdAt:new Date().toISOString(),notification:{status:'pending'}};
    queue.push(entry);save(queuePath(root),queue);
    entry.notification=await notifyHermes(root,entry,dependencies);save(queuePath(root),queue);return entry;
  },{timeoutMs:20000});
}
function getQueue(root){const queue=load(queuePath(root),[]);if(!Array.isArray(queue))throw new Error('面试队列格式无效。');return queue;}
export async function getInterviewDashboard(root=getCareerOpsRoot(),{calendar=runAppleCalendar}={}) {
  const settings=getInterviewSettings(root);let calendars=[],calendarError='';
  try{calendars=await calendar({action:'calendars'});}catch(error){calendarError=error.message;}
  const queue=getQueue(root);return{settings,calendars,calendarError,pending:queue.filter(e=>e.status!=='scheduled'),events:queue.filter(e=>e.status==='scheduled')};
}
function deriveTime(entry,settings){
  if(entry.needsUser||!entry.proposedStart)return{};
  const start=entry.proposedStart;
  const end=entry.proposedEnd||(settings.defaultDurationMinutes?new Date(+parseExplicitDate(start)+settings.defaultDurationMinutes*60000).toISOString():undefined);
  return{start,end};
}
export async function planInterviewInvite(root,{id},{calendar=runAppleCalendar,now=Date.now()}={}) {
  const settings=getInterviewSettings(root,{redact:false}),entry=getQueue(root).find(e=>e.id===id);
  if(!entry)throw new Error('面试邀约不存在。');
  const time=deriveTime(entry,settings),blocked=reason=>({eligible:false,reason,...time});
  if(entry.status==='scheduled')return blocked('该面试已加入日历。');
  if(!settings.autoConfirmWithinAvailability)return blocked('尚未开启预授权时段自动确认。');
  if(!settings.calendarId)return blocked('请先选择 Apple 日历。');
  if(!time.start||!time.end)return blocked('缺少完整唯一日期或结束时间；可由本人设置默认时长。');
  if(+parseExplicitDate(time.start)<=now)return blocked('该时间已过，请本人核对。');
  if(!withinAvailability(time.start,time.end,settings))return blocked('对方时间不在你预设的可面试时段内。');
  const result=await calendar({action:'busy',calendarId:settings.calendarId,...time});
  if(!Array.isArray(result.busy)||overlaps(time.start,time.end,result.busy))return blocked('所选 Apple 日历在该时段存在冲突或无法核验。');
  const formatted=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(parseExplicitDate(time.start));
  return{eligible:true,reason:'符合本人预授权时段，已核验所选日历无冲突。',...time,reply:`您好，${formatted}（北京时间）可以参加面试，请告知面试方式及准备事项。`};
}
export async function confirmInterviewInvite(root,input,{calendar=runAppleCalendar,now=Date.now()}={}) {
  return withPipelineLock(queuePath(root),async()=>{
    const queue=getQueue(root),entry=queue.find(e=>e.id===input.id);if(!entry)throw new Error('面试邀约不存在。');
    if(entry.status==='scheduled')return entry;
    const settings=getInterviewSettings(root,{redact:false});if(!settings.calendarId)throw new Error('请先选择 Apple 日历。');
    if(input.mode==='preauthorized'){
      if(input.acknowledgementSent!==true)throw new Error('尚未确认招聘者已收到时间答复，不建立自动承诺。');
      const plan=await planInterviewInvite(root,{id:input.id},{calendar,now});if(!plan.eligible)throw new Error(plan.reason);
      if(input.start!==plan.start||input.end!==plan.end)throw new Error('时间与已核验邀约不一致。');
    }else if(input.mode!=='manual'||input.confirmed!==true)throw new Error('需要本人明确确认面试日期时间。');
    const start=parseExplicitDate(input.start),end=parseExplicitDate(input.end);
    if(+start<=now||end<=start||end-start>4*3600000)throw new Error('面试时间必须在未来，且时长在四小时以内。');
    const key=createHash('sha256').update(entry.id).digest('hex').slice(0,28);
    const result=await calendar({action:'create',calendarId:settings.calendarId,start:start.toISOString(),end:end.toISOString(),key,title:`面试｜${entry.company}｜${entry.title}`,description:`AI直聘面试安排\n公司：${entry.company}\n岗位：${entry.title}`,reminders:settings.reminders});
    if(!['created','existing'].includes(result.status)||!result.event?.uid)throw new Error('日历写入结果未知，请核对日历后重试。');
    Object.assign(entry,{status:'scheduled',confirmedAt:new Date().toISOString(),mode:input.mode,event:{...result.event,calendarId:settings.calendarId},start:start.toISOString(),end:end.toISOString()});save(queuePath(root),queue);return entry;
  },{timeoutMs:30000});
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{let text='';for await(const chunk of process.stdin)text+=chunk;if(text.length>20000)throw new Error('输入过长');const input=text?JSON.parse(text):{},root=getCareerOpsRoot();let result;
    if(process.argv[2]==='status')result=await getInterviewDashboard(root);
    else if(input.op==='save-settings')result=await saveInterviewSettings(root,input.settings);
    else if(input.op==='queue-invite')result=await queueInterviewInvite(root,input.invite);
    else if(input.op==='plan-invite')result=await planInterviewInvite(root,input);
    else if(input.op==='confirm-invite')result=await confirmInterviewInvite(root,{...input,mode:'manual'});
    else throw new Error('不支持的面试操作');console.log(JSON.stringify(result));
  }catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
