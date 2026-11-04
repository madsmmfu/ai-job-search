import { NextResponse } from "next/server";
import { searchBoss } from "@/lib/boss/browser";
import { runBossMarket } from "@/lib/boss/market";
import { readMarketDetails } from "@/lib/boss/market-details.mjs";
import { createBossWebBridge, withBossBridgeLock } from "@/lib/boss/webbridge.mjs";
import { readBossSalaries } from "@/lib/boss/salary-ocr.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;
const state = globalThis as typeof globalThis & { __bossMarketCollecting?: boolean };

export async function GET() {
  try { return NextResponse.json(await runBossMarket("report")); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取市场分析。" }, { status: 500 }); }
}
export async function POST(request: Request) {
  if (state.__bossMarketCollecting) return NextResponse.json({ error: "市场采集正在进行，请稍后查看结果。" }, { status: 409 });
  let input;
  try { const text = await request.text(); if (text.length > 3000) throw new Error(); input = JSON.parse(text); } catch { return NextResponse.json({ error: "请求格式无效。" }, { status: 400 }); }
  if (!input || Array.isArray(input) || typeof input !== "object" || input.op !== "collect" || (input.keywords !== undefined && (!Array.isArray(input.keywords) || input.keywords.length < 1 || input.keywords.length > 3 || input.keywords.some((k: unknown) => typeof k !== "string" || !k.trim() || k.length > 60)))) return NextResponse.json({ error: "每次请输入 1–3 个搜索关键词，每个不超过 60 字。" }, { status: 400 });
  const keywords: string[] = [...new Set<string>((input.keywords || ["AI内容运营", "海外内容运营", "新媒体运营负责人"]).map((k: string) => k.trim()))];
  state.__bossMarketCollecting = true;
  const observations: Record<string, unknown>[] = [];
  let status = "ok", message = "", completedQueries = 0;
  const warnings: string[] = [];
  try {
    for (const [index, keyword] of keywords.entries()) {
      if (index > 0) await new Promise(resolve => setTimeout(resolve, 2000));
      const result = await searchBoss([keyword], "101210100");
      status = result.status; message = result.message;
      const capturedAt = new Date().toISOString();
      let salaries: { jobId: string; salaryText: string; salaryVerified: boolean; salarySource: string }[] = [];
      if (status === "ok" && process.env.CAREER_OPS_BOSS_TRANSPORT === "webbridge") {
        try { const bridge = createBossWebBridge(); salaries = await withBossBridgeLock(() => readBossSalaries(bridge.command)); }
        catch { warnings.push(`「${keyword}」截图薪资核验未完成，不可读薪资仍标记为未知。`); }
      }
      let details: {id:string;requirements:string}[] = [];
      if (status === "ok" && process.env.CAREER_OPS_BOSS_TRANSPORT === "webbridge") {
        const bridge=createBossWebBridge();
        const detailResult=await withBossBridgeLock(()=>readMarketDetails(bridge.command,result.offers));
        details=detailResult.records;
        if(detailResult.status==='blocked'){status='blocked';message='BOSS 要求验证，已停止本次采集。';}
      }
      for (const offer of result.offers) {
        const salary = salaries.find(item => item.jobId === offer.id);
        const readable = !!offer.salary && !/[\uE000-\uF8FF]/.test(offer.salary);
        observations.push({ ...offer, requirements:details.find(d=>d.id===offer.id)?.requirements || '', salaryText: salary?.salaryText || offer.salary, salaryVerified: salary?.salaryVerified || readable, salarySource: salary?.salarySource || (readable ? "BOSS页面可读文本" : ""), salaryCapturedAt: capturedAt, capturedAt, keyword });
      }
      if (status !== "ok") break;
      completedQueries++;
    }
    const collectionMessage = status === "ok" ? `已顺序浏览 ${completedQueries} 组关键词，读取 ${observations.length} 条岗位记录。仅可核验薪资计入分析，未读出部分保留为未知。${warnings.join(" ")}` : message;
    const report = await runBossMarket("save", { observations, collectionStatus: status, collectionMessage, collectedAt: new Date().toISOString() });
    return NextResponse.json(report);
  } catch (error) {
    const collectionMessage = error instanceof Error ? error.message : "市场采集失败。";
    try { return NextResponse.json({ ...await runBossMarket("save", { observations, collectionStatus: "error", collectionMessage, collectedAt: new Date().toISOString() }), collectionMessage }); }
    catch { return NextResponse.json({ error: collectionMessage }, { status: 500 }); }
  } finally { state.__bossMarketCollecting = false; }
}
