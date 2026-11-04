import { execFile } from 'node:child_process';
import { careerOpsRoot, rootScript } from '@/lib/career-ops';
export const runtime='nodejs';
export const dynamic='force-dynamic';
function run(action:string,input?:unknown):Promise<unknown>{
  return new Promise((resolve,reject)=>{
    const child=execFile(process.execPath,[rootScript('boss-interview-schedule'),action],{cwd:careerOpsRoot(),env:{...process.env,CAREER_OPS_ROOT:careerOpsRoot()},timeout:55000,maxBuffer:2*1024*1024},(error,stdout,stderr)=>{
      if(error){let message='面试安排操作失败。';try{message=JSON.parse(stderr.trim()).error||message;}catch{}reject(new Error(message));}
      else{try{resolve(JSON.parse(stdout));}catch{reject(new Error('面试安排响应无效。'));}}
    });child.stdin?.end(input?JSON.stringify(input):undefined);
  });
}
export async function GET(){try{return Response.json(await run('status'));}catch(error){return Response.json({error:(error as Error).message},{status:500});}}
export async function POST(request:Request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==`${url.protocol}//${request.headers.get('host')||url.host}`)return Response.json({error:'请从本地 AI直聘 操作。'},{status:403});
  try{const text=await request.text();if(text.length>20000)throw new Error('请求内容过长。');const input=JSON.parse(text);
    if(!['save-settings','queue-invite','plan-invite','confirm-invite'].includes(input?.op))throw new Error('不支持的操作。');
    return Response.json(await run('control',input));
  }catch(error){return Response.json({error:(error as Error).message},{status:400});}
}
