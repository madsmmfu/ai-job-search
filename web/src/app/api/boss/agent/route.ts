import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { execFile } from 'node:child_process';
import { careerOpsRoot, rootScript } from '@/lib/career-ops';

export const runtime='nodejs';
export const dynamic='force-dynamic';

function run(action:string,input?:unknown):Promise<unknown> {
  return new Promise((resolve,reject)=>{
    const child=execFile(process.execPath,[rootScript('boss-agent'),action],{cwd:careerOpsRoot(),env:{...process.env,CAREER_OPS_ROOT:careerOpsRoot()},timeout:10000,maxBuffer:2*1024*1024},(error,stdout,stderr)=>{
      if(error){try{reject(new Error(JSON.parse(stderr.trim()).error));}catch{reject(new Error('常驻助手状态暂不可用。'));}}
      else {try{resolve(JSON.parse(stdout));}catch{reject(new Error('常驻助手响应无效。'));}}
    });child.stdin?.end(input?JSON.stringify(input):undefined);
  });
}
function profileDetails(){
  const profile=yaml.load(fs.readFileSync(path.join(careerOpsRoot(),'config/profile.yml'),'utf8')) as {candidate?:{full_name?:string};location?:{cities?:string[]};target_roles?:{primary?:string[]};compensation?:{target_monthly_cny?:number};availability?:{start?:string;interview?:string}};
  return {candidateName:profile.candidate?.full_name||'',targetCities:profile.location?.cities||[],targetRoles:profile.target_roles?.primary||[],salaryTarget:profile.compensation?.target_monthly_cny, startAvailability:profile.availability?.start,interviewPolicy:profile.availability?.interview};
}
export async function GET(){try{return Response.json({...await run('status') as object,...profileDetails()});}catch(error){return Response.json({error:(error as Error).message},{status:500});}}
export async function POST(request:Request){
  const url=new URL(request.url),origin=request.headers.get('origin');
  if(origin&&origin!==`${url.protocol}//${request.headers.get('host')||url.host}`)return Response.json({error:'请从本地AI直聘操作。'},{status:403});
  try {
    const text=await request.text();if(text.length>5000)throw new Error('输入过长。');
    const input=JSON.parse(text);
    if(!input||!['start','finish-login','pause','login','check','resolve'].includes(input.op))throw new Error('不支持的操作。');
    return Response.json(await run('control',input));
  }catch(error){return Response.json({error:(error as Error).message},{status:400});}
}
