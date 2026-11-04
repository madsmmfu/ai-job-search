export const BOSS_HOME = "https://www.zhipin.com/web/geek/job";

export function bossSearchInput(body) {
  if (!body || !Array.isArray(body.keywords) || body.keywords.length < 1 || body.keywords.length > 5) {
    throw new Error("请提供 1 到 5 个搜索关键词。");
  }
  if (body.keywords.some((value) => typeof value !== "string" || !value.trim() || value.trim().length > 80)) {
    throw new Error("每个搜索关键词需为 1 到 80 个字符。");
  }
  const city = body.city === undefined ? "100010000" : body.city;
  if (typeof city !== "string" || !/^\d{9}$/.test(city)) throw new Error("请选择有效的 BOSS 直聘城市。");
  return { keywords: [...new Set(body.keywords.map((value) => value.trim()))], city };
}

export function bossSearchUrl(keyword, city = "100010000") {
  const url = new URL(BOSS_HOME);
  url.searchParams.set("query", keyword);
  url.searchParams.set("city", city);
  return url.href;
}

export function bossJobUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const url = new URL(value, BOSS_HOME);
    if (url.protocol !== "https:" || url.hostname !== "www.zhipin.com" || url.port || url.username || url.password || !/^\/job_detail\/[A-Za-z0-9_-]+\.html$/.test(url.pathname)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}

function clean(value, limit = 200) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}

export function normalizeBossCards(cards, keyword) {
  const seen = new Set();
  return cards.flatMap((card) => {
    const url = bossJobUrl(card.href);
    const title = clean(card.title);
    if (!url || !title || seen.has(new URL(url).pathname)) return [];
    seen.add(new URL(url).pathname);
    return [{ id: new URL(url).pathname.split("/").pop().replace(/\.html$/, ""), title,
      company: clean(card.company), location: clean(card.location), salary: /[\uE000-\uF8FF\u{F0000}-\u{FFFFD}\u{100000}-\u{10FFFD}]/u.test(clean(card.salary)) ? "" : clean(card.salary),
      experience: clean(card.experience), education: clean(card.education), url,
      source: "BOSS直聘", keyword }];
  });
}

export function bossPageStatus({ url = "", text = "", hasCards = false, httpStatus = 200 }) {
  let parsed;
  try { parsed = new URL(url); } catch { /* An unopened browser has no URL. */ }
  if (!parsed || parsed.protocol !== "https:" || parsed.hostname !== "www.zhipin.com") {
    return { status: "login_required", message: "尚未连接 BOSS 直聘，请打开专用浏览器登录。" };
  }
  if (httpStatus === 403 || httpStatus === 429 || /图形验证码|安全验证|访问异常|访问受限|访问过于频繁|操作过于频繁|请完成验证|人机验证|滑块|网络环境存在风险/.test(text) || /captcha|verify|security-check/i.test(parsed.pathname)) {
    return { status: "blocked", message: "BOSS 直聘要求安全验证或限制了当前访问，搜索已停止。请在专用浏览器完成验证后手动重试。" };
  }
  if (httpStatus >= 400) return { status: "error", message: "BOSS 直聘页面暂时无法访问，搜索已停止，请检查专用浏览器中的提示。" };
  if (/\/web\/(?:user|passport)|\/login/.test(parsed.pathname) || /扫码登录|扫描二维码登录|短信登录|微信登录|请先登录|登录后查看|登录后继续/.test(text)) {
    return { status: "login_required", message: "请在已打开的 BOSS 直聘专用浏览器中完成登录，再返回搜索。" };
  }
  if (hasCards) return { status: "ok", message: "已连接 BOSS 直聘，可以读取当前可见岗位。" };
  if (/暂无(?:相关)?职位|没有找到|未找到.*职位|暂无搜索结果|暂无符合条件/.test(text)) {
    return { status: "ok", message: "BOSS 直聘当前搜索没有找到岗位，可调整关键词或城市。" };
  }
  return { status: "error", message: "未能读取 BOSS 直聘岗位列表。请检查专用浏览器是否已登录及页面是否加载完成，再手动重试。" };
}
