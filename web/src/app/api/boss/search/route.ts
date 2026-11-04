import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/json-body";
import { bossSearchInput } from "@/lib/boss/parser.mjs";
import { searchBoss } from "@/lib/boss/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await readJsonObject(req);
  let input;
  try { input = bossSearchInput(body); }
  catch (error) {
    return NextResponse.json({ status: "error", message: error instanceof Error ? error.message : "无效的搜索请求。", offers: [], searchUrl: "" }, { status: 400 });
  }
  return NextResponse.json(await searchBoss(input.keywords, input.city));
}
