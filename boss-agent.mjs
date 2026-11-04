import { ORIGINAL_RESUME_FILENAME } from './boss-existing-resume.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import * as yaml from 'js-yaml';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { spawnHeadlessCli } from './web/src/lib/spawn-cli.mjs';
import { CAPS } from './web/src/lib/worker-capabilities.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const now=()=>new Date().toISOString();
export async function readJson(file,fallback) {try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
export async function writeJson(file,value) {
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const tmp=path.join(path.dirname(file),'.'+path.basename(file)+'.'+randomUUID()+'.tmp');
  try{await fs.writeFile(tmp,JSON.stringify(value,null,2),{mode:0o600,flag:'wx'});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true});}
}
const files=root=>({config:path.join(root,'config/boss-agent.json'),state:path.join(root,'data/boss-agent-state.json')});
const empty=()=>({status:'starting',lastCheckedAt:null,message:'等待常驻进程启动。',transport:'headless-edge',pending:[],events:[],handled:{},counts:{sent:0,pending:0}});
export async function agentStatus(root=getCareerOpsRoot()) {
  const p=files(root),config=await readJson(p.config,{}),state=await readJson(p.state,empty());
  return {...state,handled:undefined,enabled:config.enabled===true,browserMode:config.browserMode,loginRequested:config.loginRequested===true,intervalSeconds:Math.max(60,config.intervalSeconds||120),scopes:config.scopes||[],candidateName:config.candidateName,targetCities:config.targetCities,targetRoles:config.targetRoles,configuredTransport:config.browserTransport,browserTransport:config.browserTransport,egoSpaceId:config.egoSpaceId,counts:{sent:state.counts?.sent||0,pending:state.pending.filter(p=>!p.resolved).length}};
}
export async function controlAgent(op,input={},root=getCareerOpsRoot()) {
  const p=files(root),config=await readJson(p.config,{});
  if(op==='resolve') {
    if(typeof input.answer!=='string'||!input.answer.trim()||input.answer.length>1200)throw new Error('请输入1–1200字的本次回复。');
    const state=await readJson(p.state,empty()),pending=state.pending.find(q=>q.id===input.id&&!q.resolved);
    if(!pending)throw new Error('该问题已处理或不存在。');
    pending.operatorAnswer=input.answer.trim();await writeJson(p.state,state);config.checkNonce=now();
  } else if(op==='pause'){config.enabled=false;config.loginRequested=false;delete config.holdStatus;delete config.holdMessage;}
  else if(op==='start'||op==='finish-login'){if(op==='start')config.enabled=true;config.loginRequested=true;config.browserMode=op==='start'?'login':'visible';if(op!=='finish-login')config.browserRequestId=randomUUID();config.checkNonce=now();delete config.holdStatus;delete config.holdMessage;}
  else if(op==='login'){config.enabled=false;config.loginRequested=true;config.browserMode='login';if(op!=='finish-login')config.browserRequestId=randomUUID();config.checkNonce=now();delete config.holdStatus;delete config.holdMessage;}
  else if(op==='check'){config.checkNonce=now();}
  else throw new Error('不支持的常驻助手操作。');
  await writeJson(p.config,config);return agentStatus(root);
}
export async function askReplyModel(prompt,config={}) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'ai-zhipin-reply-'));
  const output=path.join(dir,'answer.json');
  try {
    const childEnv={...process.env};
    // Native browsers use macOS's configured proxy, whereas CLI HTTP clients
    // generally only honor environment proxies. Reuse the existing OS setting.
    if(process.platform==='darwin'&&!childEnv.HTTPS_PROXY&&!childEnv.https_proxy){
      try {
        const {stdout}=await promisify(execFile)('/usr/sbin/scutil',['--proxy'],{timeout:3000});
        const enabled=stdout.match(/HTTPS Enable\s*:\s*1|HTTPSEnable\s*:\s*1/);
        const host=stdout.match(/HTTPSProxy\s*:\s*([A-Za-z0-9.:-]+)/)?.[1];
        const port=Number(stdout.match(/HTTPSPort\s*:\s*(\d+)/)?.[1]);
        if(enabled&&host&&port>0&&port<65536){childEnv.HTTPS_PROXY=`http://${host}:${port}`;childEnv.HTTP_PROXY ||= childEnv.HTTPS_PROXY;childEnv.NO_PROXY='127.0.0.1,localhost,::1';}
      }catch{/* No OS proxy is a valid configuration. */}
    }
    let modelFlags=[];
    try {
      const settings=await fs.readFile(path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml'),'utf8');
      // Keep the selected model, but do not start unrelated hooks, plugins or
      // MCP servers for a pure text drafting call. Authentication remains native.
      for(const key of ['model','model_reasoning_effort','model_provider']){
        if(config.modelMode==='cli-default'&&key!=='model_reasoning_effort')continue;
        const match=settings.match(new RegExp('^'+key+'\\s*=\\s*("[^"\\n]+")','m'));
        if(match)modelFlags.push('-c',`${key}=${match[1]}`);
      }
    }catch(e){if(e.code!=='ENOENT')throw e;}
    await new Promise((resolve,reject)=>{
      const child=spawnHeadlessCli(config.cliPath||'codex',['exec','--ignore-user-config','--disable','apps','--disable','plugins','--disable','hooks',...modelFlags,'--ephemeral','--skip-git-repo-check','--output-last-message',output,prompt],{cwd:dir,env:childEnv},{cliId:'codex',capabilities:CAPS.localReadOnly});
      let error='';const timer=setTimeout(()=>{child.kill('SIGTERM');reject(new Error('回复模型超时，本次问题留待处理。'));},90000);
      child.stdout.on('data',()=>{});child.stderr.on('data',c=>{error=(error+c.toString()).slice(-2000);});
      child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{
        clearTimeout(timer);
        if(code===0)return resolve();
        const diagnosis=error.split('\n').filter(line=>!/model.metadata|unknown model|fallback.*metadata/i.test(line)).join('\n');
        const reason=/not supported|does not exist|unsupported.model|model.*not found/i.test(diagnosis)?'当前模型不受此 CLI 接口支持':/401|unauthorized|authentication|invalid.api.key/i.test(diagnosis)?'模型登录或凭证需要重新确认':/403|permission|access.denied/i.test(diagnosis)?'模型接口拒绝访问':/429|quota|rate.limit/i.test(diagnosis)?'模型额度或速率受限':/time.?out|reconnect|connection|stream.disconnected/i.test(diagnosis)?'模型网络连接失败':`模型进程退出（${code}）`;
        reject(new Error(reason+'，本次问题留待处理。'));
      });
    });
    return await fs.readFile(output,'utf8');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
}
export function incomingToHandle(messages) {
  let index=-1;
  for(let i=0;i<messages.length;i++)if(messages[i].direction==='incoming')index=i;
  if(index<0 || messages.slice(index+1).some(m=>m.direction==='outgoing'))return null;
  return messages[index];
}

export async function runAgent(root=getCareerOpsRoot()) {
  const {createBossAgentBrowser}=await import('./boss-agent-browser.mjs');
  const {buildReplyPrompt,validateReplyDecision,classifyIncoming,authorizedTermsReply}=await import('./boss-reply-policy.mjs');
  const {classifyInterviewInvite,queueInterviewInvite,planInterviewInvite,confirmInterviewInvite}=await import('./boss-interview-schedule.mjs');
  const p=files(root),lock=path.join(root,'.career-ops-web','boss-agent.lock');
  await fs.mkdir(path.dirname(lock),{recursive:true,mode:0o700});
  try{const pid=Number(await fs.readFile(lock,'utf8'));try{process.kill(pid,0);throw new Error('常驻助手已在运行。');}catch(e){if(e.code!=='ESRCH')throw e;}}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.writeFile(lock,String(process.pid),{mode:0o600});
  const initialConfig=await readJson(p.config,{});
  const ego=initialConfig.browserTransport==='ego-lite';
  const nativeBridge=ego||initialConfig.browserTransport==='webbridge';
  const transportName=ego?'ego-lite':'webbridge-edge';
  const browserFactory=ego?(await import('./boss-agent-ego.mjs')).createBossEgoAgentBrowser:nativeBridge?(await import('./boss-agent-webbridge.mjs')).createBossWebBridgeAgentBrowser:createBossAgentBrowser;
  let browser=browserFactory({dataRoot:root,allowlist:initialConfig.scopes||[],egoSpaceId:initialConfig.egoSpaceId,egoPageLabel:initialConfig.egoPageLabel,candidateName:initialConfig.candidateName}),mode=null,browserRequestId='',lastRun=0,nonce='',stopping=false;
  let state=await readJson(p.state,empty());state.pid=process.pid;
  state.counts ||= {sent:0,pending:0};
  state.handled ||= {}; state.pending ||= []; state.events ||= [];
  // A process restart cannot prove a prior click failed; never resend it.
  for(const key of Object.keys(state.handled))if(state.handled[key].status==='sending')state.handled[key].status='unknown';
  async function persist(){
    const current=await readJson(p.state,empty());
    for(const q of state.pending){const newer=current.pending.find(n=>n.id===q.id);if(newer?.operatorAnswer)q.operatorAnswer=newer.operatorAnswer;}
    state.updatedAt=now();state.events=state.events.slice(-100);await writeJson(p.state,state);
  }
  const event=(target,status,message)=>state.events.push({id:randomUUID(),company:target.company,title:target.title,status,message,createdAt:now()});
  const pending=(target,incoming,reason,key)=>{
    if(!state.pending.some(q=>q.id===key))state.pending.push({id:key,company:target.company,title:target.title,question:incoming.text,reason,createdAt:now(),incomingId:incoming.id,resolved:false});
    state.handled[key]={status:'pending'};
  };
  const stop=()=>{stopping=true;};process.on('SIGTERM',stop);process.on('SIGINT',stop);
  try {
    while(!stopping) {
      const config=await readJson(p.config,{});
      if(!config.enabled&&!config.loginRequested){if(mode){await browser.close();mode=null;}state.status=config.holdStatus||'paused';state.message=config.holdMessage||'已暂停自动回复。';await persist();await new Promise(r=>setTimeout(r,5000));continue;}
      const desired=!nativeBridge&&config.browserMode==='headless'?'headless':'visible';
      if(mode!==desired||browserRequestId!==(config.browserRequestId||'')){await browser.close();state.browserOpen=await browser.open({headless:desired==='headless'});mode=desired;browserRequestId=config.browserRequestId||'';lastRun=0;}
      const status=await browser.status();state.transport=nativeBridge?transportName:mode==='headless'?'headless-edge':'visible-edge';const latestConfig=await readJson(p.config,{});if(latestConfig.browserRequestId!==config.browserRequestId||(!latestConfig.enabled&&!latestConfig.loginRequested))continue;state.pageUrl=status.pageUrl||null;state.pageUrls=status.pageUrls||[];
      if(status.status!=='ok'){
        state.status=status.status;state.message=status.message;state.lastCheckedAt=now();
        if((status.status==='blocked'&&mode==='headless')||(mode==='headless'&&status.status==='login_required')){
          if(mode==='headless'&&status.status==='login_required'){config.browserMode='login';state.message='登录已失效，正在打开专用 Edge，请扫码登录。';}else{config.enabled=false;config.holdStatus=status.status;config.holdMessage=status.message;}await writeJson(p.config,config);await browser.close();mode=null;
        }
        await persist();await new Promise(r=>setTimeout(r,10000));continue;
      }
      if(config.browserMode==='login'){latestConfig.browserMode='visible';await writeJson(p.config,latestConfig);state.message='已确认登录，保持当前 Edge 会话检查消息。';await persist();continue;}
      if(!latestConfig.enabled){state.status='ready';state.transport=nativeBridge?transportName:'visible-edge';state.message='已确认 BOSS 登录成功，自动回复保持暂停。';state.lastCheckedAt=now();await persist();await new Promise(r=>setTimeout(r,5000));continue;}
      if(Date.now()-lastRun<Math.max(60,config.intervalSeconds||120)*1000&&nonce===(config.checkNonce||'')){await new Promise(r=>setTimeout(r,5000));continue;}
      lastRun=Date.now();nonce=config.checkNonce||'';state.status='running';state.transport=nativeBridge?transportName:mode==='headless'?'headless-edge':'visible-edge';state.message=(ego?'Ego Lite':mode==='headless'?'无头 Edge':'专用 Edge')+' 已登录，正在检查授权岗位的新消息。';state.lastCheckedAt=now();await persist();
      const cv=await fs.readFile(path.join(root,'cv.md'),'utf8');
      let profile='';for(const f of ['config/profile.yml','modes/_profile.md'])try{profile+='\n'+await fs.readFile(path.join(root,f),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
      let profileObject={};try{profileObject=yaml.load(await fs.readFile(path.join(root,'config/profile.yml'),'utf8'))||{};}catch(e){if(e.code!=='ENOENT')throw e;}
      const market=await readJson(path.join(root,'data/boss-market.json'),{observations:[]});
      let sent=0,interrupted=false;
      for(const target of (config.scopes||[])) {
        let activeItem;
        if(stopping||!(await readJson(p.config,{})).enabled)break;
        try {
          const thread=await browser.readThread(target);if(!thread?.recipient)continue;
          const conversationId=createHash('sha256').update(target.url).digest('hex').slice(0,24);
          await writeJson(path.join(root,'data/boss-agent-conversations',conversationId+'.json'),{company:target.company,title:target.title,url:target.url,recordedAt:now(),messages:thread.messages.slice(-30)});
          const incoming=incomingToHandle(thread.messages);if(!incoming?.id)continue;
          const key=createHash('sha256').update([target.url,thread.recipient.recruiter,incoming.id].join('\n')).digest('hex');
          activeItem={incoming,key};
          const live=await readJson(p.state,empty()),manual=live.pending.find(q=>q.id===key&&!q.resolved&&q.operatorAnswer);
          if(['sending','unknown','sent'].includes(state.handled[key]?.status))continue;
          const resumeRequest=classifyIncoming(incoming.text)==='resume' && ego && config.candidateName==='示例求职者';
          if(state.handled[key]&&!manual&&!resumeRequest)continue;
          if(resumeRequest){
            const filename=ORIGINAL_RESUME_FILENAME;
            const ledgerId=createHash('sha256').update(JSON.stringify([config.candidateName,thread.recipient,filename])).digest('hex');
            const ledgerFile=path.join(root,'data/boss-existing-resume-sends',ledgerId+'.json');
            const previous=await readJson(ledgerFile,null);
            const result=await browser.sendExistingResume(target,{filename,expectedIncomingId:incoming.id,previous,save:value=>writeJson(ledgerFile,{...value,at:now(),url:target.url})});
            if(result.status==='sent'||result.status==='unknown')state.handled[key]={status:result.status,at:now(),kind:'resume',filename};
            if(result.status==='sent'){const q=state.pending.find(q=>q.id===key);if(q)q.resolved=true;state.counts.resumeSent=(state.counts.resumeSent||0)+1;sent++;}
            else {pending(target,incoming,result.message||'简历发送结果需要核对。',key);if(result.status==='unknown')state.handled[key]={status:'unknown',at:now(),kind:'resume',filename};}
            event(target,result.status,result.message);await persist();
            if(sent>=Math.min(5,config.maxRepliesPerCycle||2))break;
            continue;
          }
          let reply,decision,schedulePlan;
          if(manual)reply=manual.operatorAnswer;
          else {
            const kind=classifyIncoming(incoming.text);
            if(classifyInterviewInvite(incoming.text).isInvite){
              await queueInterviewInvite(root,{id:key,company:target.company,title:target.title,text:incoming.text});
              const plan=await planInterviewInvite(root,{id:key});
              if(plan.eligible){reply=plan.reply;schedulePlan=plan;}
              else {pending(target,incoming,'面试邀约已进入日程队列：'+plan.reason,key);await persist();continue;}
            }
            if(!reply){
            const authorized=authorizedTermsReply(incoming.text,profileObject);
            if(authorized)reply=authorized.reply;
            if(!reply&&(kind==='sensitive'||kind==='resume')){pending(target,incoming,kind==='resume'?'对方索要简历，请使用对应岗位的代发功能。':'涉及尚未确认的个人信息或承诺，请填写本次回复。',key);await persist();continue;}
            if(!reply){
            const job=market.observations.find(j=>j.url?.split('?')[0]===target.url)||target;
            const context={cv,profile,job,chat:{messages:thread.messages.slice(-12),latestIncoming:incoming}};
            decision=validateReplyDecision(await askReplyModel(buildReplyPrompt(context),config),context);
            if(decision.action==='ignore'){state.handled[key]={status:'ignored'};await persist();continue;}
            if(decision.action!=='reply'){pending(target,incoming,decision.reason||'需要你补充准确的信息。',key);await persist();continue;}
            reply=decision.reply;
            }
            }
          }
          if(!(await readJson(p.config,{})).enabled)break;
          state.handled[key]={status:'sending',at:now()};await persist();
          const result=await browser.sendReply(target,reply,{expectedIncomingId:incoming.id});
          state.handled[key]={status:result.status,at:now()};
          event(target,result.status,result.status==='sent'?'已核对聊天回执并发送回复。':result.message||'回复结果待核对，不自动重发。');
          if(result.status==='sent'){const q=state.pending.find(q=>q.id===key);if(q)q.resolved=true;sent++;state.counts.sent=(state.counts.sent||0)+1;}
          await persist();
          if(result.status==='sent'&&schedulePlan){
            await confirmInterviewInvite(root,{id:key,start:schedulePlan.start,end:schedulePlan.end,mode:'preauthorized',acknowledgementSent:true});
            event(target,'calendar_created','已按预授权时段确认面试，并核对 Apple 日历事件。');await persist();
          }
          if(sent>=Math.min(5,config.maxRepliesPerCycle||2))break;
        } catch(error){
          if(activeItem){
            if(state.handled[activeItem.key]?.status==='sending')state.handled[activeItem.key]={status:'unknown',at:now()};
            else if(state.handled[activeItem.key]?.status!=='sent')pending(target,activeItem.incoming,error.message,activeItem.key);
          }
          event(target,'error',error.message);const currentStatus=await browser.status();if(currentStatus.status!=='ok'){state.status=currentStatus.status;state.message=currentStatus.message;interrupted=true;}await persist();if(interrupted)break;
        }
      }
      if(!interrupted)state.message='常驻中：仅处理新消息，无新消息时不调用模型。';await persist();
    }
  } finally {await browser.close();await fs.rm(lock,{force:true});state.status='paused';state.message='常驻进程已停止。';await persist();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const action=process.argv[2]||'status';
    if(action==='daemon')await runAgent();
    else if(action==='status')console.log(JSON.stringify(await agentStatus()));
    else if(action==='control'){let text='';for await(const chunk of process.stdin){text+=chunk;if(text.length>5000)throw new Error('输入过长。');}const input=JSON.parse(text||'{}');console.log(JSON.stringify(await controlAgent(input.op,input)));}
    else throw new Error('未知操作');
  } catch(error){console.error(JSON.stringify({error:error.message}));process.exitCode=1;}
}
