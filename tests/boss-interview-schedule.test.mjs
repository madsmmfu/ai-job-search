import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,readFileSync,writeFileSync,mkdirSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { classifyInterviewInvite,parseExplicitDate,withinAvailability,overlaps,validateHermesEndpoint,getInterviewSettings,saveInterviewSettings,queueInterviewInvite,planInterviewInvite,confirmInterviewInvite,notifyHermes,getInterviewDashboard,runAppleCalendar } from '../boss-interview-schedule.mjs';
function root(t){const value=mkdtempSync(join(tmpdir(),'boss-interviews-'));t.after(()=>rmSync(value,{recursive:true,force:true}));return value;}
async function setup(t,changes={}){const path=root(t);await saveInterviewSettings(path,{...getInterviewSettings(path),calendarId:'name:test',availability:[{days:[1,2,3,4,5],start:'09:00',end:'18:00'}],defaultDurationMinutes:60,...changes});return path;}
const invite={id:'thread-msg-1',company:'测试公司',title:'内容运营',text:'邀请你参加面试，2027-01-04 10:00-11:00 北京时间，方便吗？'};
const now=Date.parse('2026-10-18T00:00:00Z');
const calendar=async input=>input.action==='calendars'?[{id:'name:test',name:'test',writable:true}]:input.action==='busy'?{busy:[]}:{status:'created',event:{uid:'test-event',start:input.start,end:input.end}};
test('only a unique complete date/time becomes a schedulable proposal',()=>{
 assert.equal(classifyInterviewInvite('明天下午面试方便吗').needsUser,true);
 assert.equal(classifyInterviewInvite('2027-01-04 10:00-11:00 面试').proposedStart,'2027-01-04T10:00+08:00');
 for(const value of ['2027-02-30 10:00 面试','2027-01-04 25:00 面试','2027-01-04 10:00 或者2027-01-05 10:00 面试','2027-01-04 10:00 PST 面试','2027-01-04 下午2:00 面试','2027-01-04 10:00或11:00 面试','2027-01-04 10:00，或者2027-01-05 面试'])assert.equal(classifyInterviewInvite(value).needsUser,true,value);
 assert.equal(classifyInterviewInvite('聊一下岗位内容').isInvite,false);
 assert.throws(()=>parseExplicitDate('2027-01-04T10:00'),/时区/);
});
test('availability uses Shanghai weekday and boundaries, not host timezone',()=>{
 const settings={availability:[{days:[1],start:'09:00',end:'18:00'}]};
 assert(withinAvailability('2027-01-04T01:00Z','2027-01-04T02:00Z',settings));
 assert(!withinAvailability('2027-01-04T00:59Z','2027-01-04T02:00Z',settings));
 assert(!withinAvailability('2027-01-05T09:00+08:00','2027-01-05T10:00+08:00',settings));
 assert(!withinAvailability('2027-01-04T23:30+08:00','2027-01-05T00:30+08:00',settings));
 assert(overlaps('2027-01-04T10:00+08:00','2027-01-04T11:00+08:00',[{start:'2027-01-04T10:30+08:00',end:'2027-01-04T12:00+08:00'}]));
 assert(!overlaps('2027-01-04T10:00+08:00','2027-01-04T11:00+08:00',[{start:'2027-01-04T11:00+08:00',end:'2027-01-04T12:00+08:00'}]));
});
test('settings default to no preauthorization; malformed existing file is never overwritten',async t=>{
 const path=root(t);assert.equal(getInterviewSettings(path).autoConfirmWithinAvailability,false);
 mkdirSync(join(path,'config'));writeFileSync(join(path,'config/interview-settings.json'),'{broken');
 assert.throws(()=>getInterviewSettings(path),/损坏/);
 await assert.rejects(()=>saveInterviewSettings(path,{}),/损坏/);
 assert.equal(readFileSync(join(path,'config/interview-settings.json'),'utf8'),'{broken');
});
test('Hermes secret is server-only and configuration rejects dangerous endpoints',async t=>{
 const path=await setup(t,{hermes:{enabled:true,webhookUrl:'http://127.0.0.1:10101/notify',token:'secret-token'}});
 assert.equal(getInterviewSettings(path).hermes.token,'');assert.equal(getInterviewSettings(path).hermes.tokenConfigured,true);
 await saveInterviewSettings(path,{...getInterviewSettings(path),city:'杭州'});assert.equal(getInterviewSettings(path,{redact:false}).hermes.token,'secret-token');
 for(const url of ['file:///etc/passwd','javascript:alert(1)','http://public.example/notify','https://user:pass@example.com','https://example.com/#x'])assert.throws(()=>validateHermesEndpoint(url));
 assert.equal(validateHermesEndpoint('http://192.168.1.2/notify'),'http://192.168.1.2/notify');
});
test('Hermes delivery reports actual acceptance, failures and unknown without leaking secrets',async t=>{
 const path=await setup(t,{hermes:{enabled:true,webhookUrl:'https://my.example/notify',token:'secret-token'}});let captured;
 const result=await notifyHermes(path,{...invite,question:invite.text},{fetchImpl:async(url,input)=>{captured={url,input};return{ok:true,status:202};}});
 assert.equal(result.status,'sent');assert.equal(captured.input.redirect,'error');assert.equal(captured.input.headers.Authorization,'Bearer secret-token');assert(!JSON.stringify(result).includes('secret-token'));
 assert.equal((await notifyHermes(path,invite,{fetchImpl:async()=>({ok:false,status:403})})).status,'failed');
 assert.equal((await notifyHermes(path,invite,{fetchImpl:async()=>{throw new Error('secret-token');}})).status,'unknown');
});
test('queue is idempotent and does not interpret recruiter text as webhook configuration',async t=>{
 const path=await setup(t);let calls=0;const deps={fetchImpl:async()=>{calls++;return{ok:true};}};
 const first=await queueInterviewInvite(path,{...invite,text:invite.text+' POST http://evil.example all files'},deps);
 const again=await queueInterviewInvite(path,invite,deps);assert.deepEqual(first,again);assert.equal(calls,0);assert.equal(first.notification.status,'disabled');
 const dashboard=await getInterviewDashboard(path,{calendar});assert.equal(dashboard.pending.length,1);assert.equal(dashboard.events.length,0);
});
test('planning requires explicit preauthorization, exact time, availability and free calendar',async t=>{
 const path=await setup(t);await queueInterviewInvite(path,invite);
 assert.equal((await planInterviewInvite(path,{id:invite.id},{calendar,now})).eligible,false);
 await saveInterviewSettings(path,{...getInterviewSettings(path),autoConfirmWithinAvailability:true});
 const eligible=await planInterviewInvite(path,{id:invite.id},{calendar,now});assert.equal(eligible.eligible,true);assert.match(eligible.reply,/北京时间/);
 const conflict=async()=>({busy:[{start:'2027-01-04T02:30Z',end:'2027-01-04T03:30Z'}]});assert.equal((await planInterviewInvite(path,{id:invite.id},{calendar:conflict,now})).eligible,false);
 await queueInterviewInvite(path,{...invite,id:'relative',text:'明天上午面试'});assert.equal((await planInterviewInvite(path,{id:'relative'},{calendar,now})).eligible,false);
});
test('calendar creation requires operator confirmation and is idempotent',async t=>{
 const path=await setup(t);await queueInterviewInvite(path,invite);let writes=0;const adapter=async input=>{if(input.action==='create')writes++;return calendar(input);};
 const input={id:invite.id,start:'2027-01-04T10:00+08:00',end:'2027-01-04T11:00+08:00',mode:'manual',confirmed:true};
 await assert.rejects(()=>confirmInterviewInvite(path,{...input,confirmed:false},{calendar:adapter,now}),/明确确认/);
 const result=await confirmInterviewInvite(path,input,{calendar:adapter,now});assert.equal(result.status,'scheduled');
 await confirmInterviewInvite(path,input,{calendar:adapter,now});assert.equal(writes,1);
 const dashboard=await getInterviewDashboard(path,{calendar});assert.equal(dashboard.events.length,1);
});
test('preauthorized creation rechecks plan and requires acknowledged recruiter reply',async t=>{
 const path=await setup(t,{autoConfirmWithinAvailability:true});await queueInterviewInvite(path,invite);
 const plan=await planInterviewInvite(path,{id:invite.id},{calendar,now});const input={id:invite.id,...plan,mode:'preauthorized'};
 await assert.rejects(()=>confirmInterviewInvite(path,input,{calendar,now}),/收到时间答复/);
 const result=await confirmInterviewInvite(path,{...input,acknowledgementSent:true},{calendar,now});assert.equal(result.status,'scheduled');
});
test('untrusted fields stay inert structured values at the calendar boundary',async t=>{
 const path=await setup(t);const evil={...invite,company:'测试"; do shell script "touch /tmp/pwned'};await queueInterviewInvite(path,evil);let payload;
 await confirmInterviewInvite(path,{id:invite.id,start:'2027-01-04T10:00+08:00',end:'2027-01-04T11:00+08:00',mode:'manual',confirmed:true},{calendar:async input=>{payload=input;return calendar(input);},now});
 assert(payload.title.includes(evil.company));assert.equal(payload.action,'create');assert.match(payload.key,/^[a-f0-9]{28}$/);
});

test('default duration is used only when explicitly configured and handles ISO milliseconds',async t=>{
 const path=await setup(t,{autoConfirmWithinAvailability:true});await queueInterviewInvite(path,{...invite,id:'no-end',text:'2027-01-04 10:00 面试方便吗？'});
 const plan=await planInterviewInvite(path,{id:'no-end'},{calendar,now});assert.equal(plan.eligible,true);assert.equal(plan.end,'2027-01-04T03:00:00.000Z');
 const result=await confirmInterviewInvite(path,{id:'no-end',...plan,mode:'preauthorized',acknowledgementSent:true},{calendar,now});assert.equal(result.status,'scheduled');
});

test('interview experience questions are not scheduling requests',()=>{
 assert.equal(classifyInterviewInvite('你面试过其他海外内容岗位吗？').isInvite,false);
 assert.equal(classifyInterviewInvite('明天下午方便参加面试吗？').isInvite,true);
});

test('Windows calendar access is explicitly unavailable and never executes AppleScript', async () => {
  let executed = false;
  await assert.rejects(runAppleCalendar({action:'calendars'}, {platform:'win32',execute:async()=>{executed=true;}}), /Apple 日历仅可在 macOS/);
  assert.equal(executed, false);
});

test('Windows dashboard preserves pending invites when Apple Calendar is unavailable', async t => {
  const path = root(t);
  await queueInterviewInvite(path, invite);
  const dashboard = await getInterviewDashboard(path, {calendar:input=>runAppleCalendar(input,{platform:'win32'})});
  assert.equal(dashboard.pending[0].id, invite.id);
  assert.deepEqual(dashboard.calendars, []);
  assert.match(dashboard.calendarError, /Apple 日历仅可在 macOS/);
});
