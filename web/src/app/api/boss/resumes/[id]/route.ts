import { NextResponse } from "next/server";
import { BossResumeError, runBossResume, parseResumeResult } from "@/lib/boss/resumes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, {params}: {params: Promise<{id:string}>}) {
  const {id}=await params;
  if(id !== "original" && !/^[a-f0-9]{16}-[a-f0-9-]{36}$/.test(id)) return NextResponse.json({error:"简历版本不存在。"},{status:404});
  try {
    const data=await runBossResume("read", undefined,id);
    const download=new URL(request.url).searchParams.get("download")==="1";
    let name = "原始简历.pdf";
    if (id !== "original") {
      const list = parseResumeResult(await runBossResume("list"));
      const version = list.versions.find((item: {id: string}) => item.id === id);
      const label = version ? `${version.company}_${version.title}` : id;
      name = `${label.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 100)}_简历.pdf`;
    }
    return new Response(new Uint8Array(data),{headers:{"Content-Type":"application/pdf","Cache-Control":"no-store","Content-Disposition":`${download?"attachment":"inline"}; filename="resume.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`}});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "无法读取简历。"},{status:error instanceof BossResumeError ? error.status : 500}); }
}
