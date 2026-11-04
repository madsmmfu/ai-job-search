import { NextResponse } from "next/server";
import { bossSession, openBossSession } from "@/lib/boss/browser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await bossSession());
}

export async function POST() {
  return NextResponse.json(await openBossSession());
}
