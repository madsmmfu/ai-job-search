import fs from 'node:fs/promises';
import path from 'node:path';
import {careerOpsRoot} from '@/lib/career-ops';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{
  const root=careerOpsRoot();
  const config=JSON.parse(await fs.readFile(path.join(root,'config/boss-agent.json'),'utf8'));
  if((!config.enabled&&!config.loginRequested)||config.browserMode!=='login')return new Response(null,{status:404});
  const file=path.join(root,'data/boss-agent-login.png'),info=await fs.stat(file);
  if(Date.now()-info.mtimeMs>30000)return new Response(null,{status:404});
  return new Response(await fs.readFile(file),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});
 }catch{return new Response(null,{status:404});}
}
