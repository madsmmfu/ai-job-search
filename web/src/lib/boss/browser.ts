import path from "node:path";
import fs from "node:fs/promises";
import { chromium, type BrowserContext, type Page } from "playwright-core";
import { careerOpsRoot } from "@/lib/career-ops";
import { BOSS_HOME, bossPageStatus, bossSearchUrl, normalizeBossCards } from "./parser.mjs";

import { readBossDom } from "./dom.mjs";
import { bossBridgeSession, openBossBridgeSession, searchBossBridge } from "./webbridge.mjs";

type Status = { status: "ok" | "login_required" | "blocked" | "error"; message: string };
type BossOffer = { id: string; title: string; company: string; location: string; salary: string; experience: string; education: string; url: string; source: string; keyword: string };
type State = { context: BrowserContext | null; page: Page | null; busy: boolean };
const globals = globalThis as typeof globalThis & { __careerOpsBossBrowser?: State };
const state = globals.__careerOpsBossBrowser ??= { context: null, page: null, busy: false };

function currentPage() {
  return state.page && !state.page.isClosed() ? state.page : null;
}

async function snapshot(page: Page, httpStatus = 200) {
  // Only examine the public page rendered by the normal browser. Never read
  // cookies, browser credentials, request payloads, or BOSS internal endpoints.
  const current = new URL(page.url());
  if (current.origin !== "https://www.zhipin.com") return { status: bossPageStatus({ url: page.url() }), cards: [] };
  const data = await page.evaluate(readBossDom);
  const cards = normalizeBossCards(data.cards, "");
  return { status: bossPageStatus({ url: page.url(), text: data.text, hasCards: cards.length > 0, httpStatus }), cards };
}

export async function bossSession(): Promise<Status> {
  if (process.env.CAREER_OPS_BOSS_TRANSPORT === "webbridge") return await bossBridgeSession() as Status;
  const page = currentPage();
  if (!page) return { status: "login_required", message: "尚未连接 BOSS 直聘，请打开专用浏览器登录。" };
  if (state.busy) return { status: "error", message: "BOSS 直聘浏览器正在处理请求，请稍后刷新状态。" };
  try { return (await snapshot(page)).status as Status; }
  catch { return { status: "error", message: "无法读取专用浏览器，请重新打开登录窗口。" }; }
}

async function openBrowser() {
  let page = currentPage();
  if (page) return page;
  if (state.context) await state.context.close().catch(() => {});
  const profile = path.join(careerOpsRoot(), ".career-ops-web", "boss-browser");
  await fs.mkdir(profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(profile, { channel: "chrome", headless: false, chromiumSandbox: true, viewport: null });
  state.context = context;
  page = context.pages()[0] || await context.newPage();
  state.page = page;
  context.on("close", () => { if (state.context === context) { state.context = null; state.page = null; } });
  return page;
}

export async function openBossSession(): Promise<Status> {
  if (process.env.CAREER_OPS_BOSS_TRANSPORT === "webbridge") return await openBossBridgeSession() as Status;
  if (state.busy) return { status: "error", message: "BOSS 直聘浏览器正在处理请求，请稍后再试。" };
  state.busy = true;
  try {
    const page = await openBrowser();
    await page.bringToFront();
    const response = await page.goto(BOSS_HOME, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.bringToFront();
    return (await snapshot(page, response?.status())).status as Status;
  } catch {
    const page = currentPage();
    const actual = page ? await snapshot(page).catch(() => null) : null;
    if (actual && ["blocked", "login_required"].includes(actual.status.status)) return actual.status as Status;
    return { status: "error", message: "无法打开或加载 BOSS 直聘。请确认本机已安装 Chrome，并检查已打开浏览器的网络或验证提示。" };
  } finally { state.busy = false; }
}

export async function searchBoss(keywords: string[], city: string) {
  if (process.env.CAREER_OPS_BOSS_TRANSPORT === "webbridge") return searchBossBridge(keywords, city);
  const searchUrl = bossSearchUrl(keywords[0], city);
  const offers: BossOffer[] = [];
  if (state.busy) return { status: "error", message: "已有 BOSS 直聘请求正在进行，请稍后再试。", offers, searchUrl };
  const page = currentPage();
  if (!page) return { status: "login_required", message: "请先打开 BOSS 直聘专用浏览器并登录，再开始搜索。", offers, searchUrl };
  state.busy = true;
  try {
    const before = await snapshot(page);
    if (["blocked", "login_required"].includes(before.status.status)) return { ...before.status, offers, searchUrl };
    for (const keyword of keywords) {
      const url = bossSearchUrl(keyword, city);
      // Each keyword gets one navigation only; verification and access limits
      // immediately end the batch. The user chooses when to retry.
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 14000 });
      const immediate = await snapshot(page, response?.status());
      if (["blocked", "login_required"].includes(immediate.status.status) || (response?.status() || 200) >= 400) {
        return { ...immediate.status, offers, searchUrl: url };
      }
      if (!immediate.cards.length && immediate.status.status !== "ok") {
        await page.locator('.job-card-wrapper, .job-card-box, a[href*="/job_detail/"]').first().waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
      }
      const result = await snapshot(page, response?.status());
      if (result.status.status !== "ok") return { ...result.status, offers, searchUrl: url };
      for (const offer of result.cards) {
        if (!offers.some((existing) => existing.id === offer.id)) offers.push({ ...offer, keyword });
      }
    }
    return { status: "ok", message: offers.length ? `已从 BOSS 直聘读取 ${offers.length} 个岗位。` : "BOSS 直聘没有找到匹配岗位，可调整关键词或城市。", offers, searchUrl };
  } catch {
    // Navigation may time out on a challenge. Preserve its actual visible
    // status where possible instead of hiding it behind a network error.
    const actual = await snapshot(page).catch(() => null);
    if (actual && ["blocked", "login_required"].includes(actual.status.status)) return { ...actual.status, offers, searchUrl: page.url() };
    return { status: "error", message: "BOSS 直聘页面加载失败或超时，搜索已停止。请检查专用浏览器中的网络和验证提示，再手动重试。", offers, searchUrl };
  } finally { state.busy = false; }
}
