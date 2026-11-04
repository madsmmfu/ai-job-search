import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { careerOpsRoot } from '@/lib/career-ops';
import { atomicWrite } from '@/lib/core/safe-write';
import { createBossWebBridge, withBossBridgeLock } from '@/lib/boss/webbridge.mjs';
import { readCurrentResumeChat } from '@/lib/boss/resume-chat.mjs';
import { sendResumeThroughBridge } from '@/lib/boss/send-resume.mjs';
import { runBossResume, parseResumeResult } from '@/lib/boss/resumes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const requestUrl = new URL(request.url);
  const expectedOrigin = `${requestUrl.protocol}//${request.headers.get('host') || requestUrl.host}`;
  if (origin && origin !== expectedOrigin) return Response.json({status:'blocked',message:'请在本地工作台点击发送。'},{status:403});
  try {
    const body = await request.json();
    if (body.op !== 'send' || typeof body.id !== 'string' || !/^[a-f0-9]{16}-[a-f0-9-]{36}$/.test(body.id)) return Response.json({status:'blocked',message:'请选择有效的简历版本。'},{status:400});
    return await withBossBridgeLock(async () => {
      const list = parseResumeResult(await runBossResume('list'));
      const version = list.versions.find((v: {id:string})=>v.id===body.id);
      if (!version) return Response.json({status:'blocked',message:'该简历版本不存在。'},{status:404});
      const bridge = createBossWebBridge({timeoutMs:15000});
      const raw = await bridge.command('evaluate',{code:`JSON.stringify((${readCurrentResumeChat.toString()})())`});
      const chat = typeof raw.value==='string' ? JSON.parse(raw.value) : raw.value;
      if (!chat?.recruiter) return Response.json({status:'blocked',message:'请先在 Edge 打开对应岗位聊天。'},{status:422});
      const root=fs.realpathSync(careerOpsRoot());
      const directory=path.join(root,'data','boss-resume-sends');
      // Protect the user-layer ledger just like the core PDF reader protects files.
      for(const part of [path.join(root,'data'),directory]) {
        try {if(fs.lstatSync(part).isSymbolicLink())throw new Error('发送记录目录不能为符号链接。');}
        catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      }
      fs.mkdirSync(directory,{recursive:true,mode:0o700});
      const key=createHash('sha256').update([version.id,chat.company,chat.title,chat.recruiter].join('\n')).digest('hex');
      const filename=path.join(directory,key+'.json');
      let previous;
      try {if(fs.lstatSync(filename).isSymbolicLink())throw new Error('发送记录无效。');previous=JSON.parse(fs.readFileSync(filename,'utf8'));}
      catch(error) {if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      const pdf=await runBossResume('read',undefined,version.id);
      if(pdf.length>10*1024*1024) return Response.json({status:'blocked',message:'附件超过10MB，请先压缩。'},{status:413});
      const result=await sendResumeThroughBridge({bridge,version,pdf,previous,save:async (value: object)=>atomicWrite(filename,JSON.stringify({...value,versionId:version.id,updatedAt:new Date().toISOString()}))});
      return Response.json(result);
    });
  } catch {
    return Response.json({status:'error',message:'无法完成代发，请检查 Edge 与 WebBridge 连接。若已点击发送，请先核对 BOSS 记录。'},{status:503});
  }
}
