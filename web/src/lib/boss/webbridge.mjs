import { BOSS_HOME, bossPageStatus, bossSearchUrl, normalizeBossCards } from "./parser.mjs";
import { readBossDom } from "./dom.mjs";

const SESSION = "career-ops-boss-edge";
const MISSING_SESSION = /has no tab|no active tab|session.*(?:not found|missing)/i;
const state = globalThis.__careerOpsBossWebBridge ??= { busy: false };
export async function withBossBridgeLock(work) {
  if (state.busy) throw new Error("BOSS 浏览器正在处理其他操作，请稍后再试。");
  state.busy = true;
  try { return await work(); } finally { state.busy = false; }
}

/** Local daemon only. Injection keeps transport and timeout tests off the user's browser. */
export function createBossWebBridge({ fetchImpl = fetch, timeoutMs = 10000, sessionName = SESSION } = {}) {
  async function command(action, args = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl("http://127.0.0.1:10086/command", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, args, session: sessionName }), signal: controller.signal,
      });
      let result;
      try { result = await response.json(); } catch { throw new Error("浏览器连接服务暂时无法访问。"); }
      if (!response.ok && !result?.error) throw new Error("浏览器连接服务暂时无法访问。");
      if (result.ok === false || result.success === false) throw new Error(result.error?.message || result.error || "浏览器操作失败。");
      return result.data ?? result;
    } finally { clearTimeout(timer); }
  }

  async function acquire() {
    return command("find_tab", { url: "https://www.zhipin.com", active: true });
  }

  async function snapshot() {
    let snap;
    try { snap = await command("snapshot"); }
    catch (error) {
      if (!MISSING_SESSION.test(error.message)) throw error;
      await acquire();
      snap = await command("snapshot");
    }
    if (!isBoss(snap.url)) return { status: bossPageStatus({ url: snap.url }), cards: [], url: snap.url };
    const text = treeText(snap.tree);
    const initial = bossPageStatus({ url: snap.url, text });
    if (["blocked", "login_required"].includes(initial.status)) return { status: initial, cards: [], url: snap.url };
    // Accessibility snapshots lack the job hrefs. Read rendered DOM attributes
    // only; this evaluator never calls fetch or touches browser credentials.
    const evaluated = await command("evaluate", { code: `JSON.stringify((${readBossDom.toString()})())` });
    const dom = typeof evaluated.value === "string" ? JSON.parse(evaluated.value) : evaluated.value;
    if (!dom || !isBoss(dom.url)) return { status: bossPageStatus({ url: dom?.url }), cards: [], url: dom?.url || "" };
    const cards = normalizeBossCards(Array.isArray(dom.cards) ? dom.cards : [], "");
    return { status: bossPageStatus({ url: dom.url, text: dom.text || text, hasCards: cards.length > 0 }), cards, url: dom.url };
  }

  async function session() {
    if (state.busy) return busyStatus();
    try { return (await snapshot()).status; }
    catch { return connectionError(); }
  }

  async function open() {
    if (state.busy) return busyStatus();
    state.busy = true;
    try {
      // Reuse the already logged-in Edge page; never send it back to a login URL.
      await acquire();
      return (await snapshot()).status;
    } catch { return connectionError(); }
    finally { state.busy = false; }
  }

  async function search(keywords, city) {
    const searchUrl = bridgeSearchUrl(keywords[0], city);
    const offers = [];
    if (state.busy) return { ...busyStatus(), offers, searchUrl };
    state.busy = true;
    try {
      const before = await snapshot();
      if (["blocked", "login_required"].includes(before.status.status)) return { ...before.status, offers, searchUrl };
      for (const keyword of keywords) {
        const url = bridgeSearchUrl(keyword, city);
        let navigationFailed = false;
        // Some pages load while navigate waits for a response. Never repeat the
        // navigation: examine the final rendered page after the bounded call.
        try { await command("navigate", { url, newTab: false }); }
        catch { navigationFailed = true; }
        const result = await readBossSearchUntilReady(snapshot, url);
        if (["blocked", "login_required"].includes(result.status.status)) return { ...result.status, offers, searchUrl: url };
        if (!sameSearch(result.url, url)) return { status: "error", message: "BOSS 直聘未完成页面切换，搜索已停止，请检查当前浏览器页面后手动重试。", offers, searchUrl: url };
        if (result.status.status !== "ok") return { ...result.status, offers, searchUrl: url };
        // Matching URL and readable cards prove the navigation completed even
        // if its transport response timed out. Never reuse stale previous jobs.
        for (const offer of result.cards) if (!offers.some((existing) => existing.id === offer.id)) offers.push({ ...offer, keyword });
        if (navigationFailed && !result.cards.length) return { ...result.status, offers, searchUrl: url };
      }
      return { status: "ok", message: offers.length ? `已从 BOSS 直聘读取 ${offers.length} 个岗位。` : "BOSS 直聘没有找到匹配岗位，可调整关键词或城市。", offers, searchUrl };
    } catch { return { ...connectionError(), offers, searchUrl }; }
    finally { state.busy = false; }
  }
  return { command, snapshot, session, open, search };
}

function isBoss(value) {
  try { return new URL(value).origin === "https://www.zhipin.com"; } catch { return false; }
}
function treeText(tree) {
  if (!Array.isArray(tree)) return "";
  return tree.map((node) => [node.name, node.text, treeText(node.children)].filter((value) => typeof value === "string").join(" ")).join(" ");
}
function busyStatus() { return { status: "error", message: "已有 BOSS 直聘请求正在进行，请稍后再试。" }; }
function connectionError() { return { status: "error", message: "无法读取已登录的 Edge 浏览器。请保持 BOSS 直聘页面打开，并确认 Kimi WebBridge 已连接，再手动重试。" }; }
export function bridgeSearchUrl(keyword, city) {
  const url = new URL(bossSearchUrl(keyword, city));
  url.pathname = new URL(BOSS_HOME).pathname.replace(/\/job$/, "/jobs");
  return url.href;
}
export function sameSearch(actual, expected) {
  try {
    const left = new URL(actual), right = new URL(expected);
    return left.origin === right.origin && /^\/web\/geek\/jobs?$/.test(left.pathname) && left.searchParams.get("query") === right.searchParams.get("query") && left.searchParams.get("city") === right.searchParams.get("city");
  } catch { return false; }
}
const bridge = createBossWebBridge();
export const bossBridgeSession = bridge.session;
export const openBossBridgeSession = bridge.open;
export const searchBossBridge = bridge.search;

// Boss switches its URL before its SPA has rendered new job cards. Wait for
// the same navigation to finish; never navigate again or reuse a prior query.
export async function readBossSearchUntilReady(snapshot, expectedUrl, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  let result = await snapshot();
  for (let attempt = 0; attempt < 6; attempt++) {
    if (["blocked", "login_required", "ok"].includes(result.status.status)) return result;
    if (!sameSearch(result.url, expectedUrl)) return result;
    await wait(500);
    result = await snapshot();
  }
  return result;
}
