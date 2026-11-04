import { NextResponse } from "next/server";
import { BossResumeError, parseResumeResult, runBossResume } from "@/lib/boss/resumes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(parseResumeResult(await runBossResume("list"))); }
  catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "无法读取简历版本。"},{status:error instanceof BossResumeError ? error.status : 500}); }
}
export async function POST(request: Request) {
  try {
    const text = await request.text();
    if(text.length > 50000) return NextResponse.json({error:"请求内容过长。"},{status:413});
    let input;
    try { input=JSON.parse(text); } catch { return NextResponse.json({error:"请求格式无效。"},{status:400}); }
    return NextResponse.json(parseResumeResult(await runBossResume("create", input)),{status:201});
  } catch(error) { return NextResponse.json({error:error instanceof Error ? error.message : "无法生成简历。"},{status:error instanceof BossResumeError ? error.status : 500}); }
}
