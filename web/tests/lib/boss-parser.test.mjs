import test from "node:test";
import assert from "node:assert/strict";
import { bossSearchInput, bossSearchUrl, bossJobUrl, bossPageStatus, normalizeBossCards } from "../../src/lib/boss/parser.mjs";

test("BOSS input limits batch and validates keyword/city types", () => {
  assert.deepEqual(bossSearchInput({ keywords: ["  内容运营 ", "内容运营", "AI"] }), { keywords: ["内容运营", "AI"], city: "100010000" });
  for (const value of [null, {}, { keywords: [] }, { keywords: Array(6).fill("a") }, { keywords: [null] }, { keywords: [" "] }, { keywords: ["a".repeat(81)] }, { keywords: ["a"], city: "abc" }, { keywords: ["a"], city: 100010000 }]) assert.throws(() => bossSearchInput(value));
});

test("search URLs use only BOSS with query parameters encoded", () => {
  const url = new URL(bossSearchUrl("AI & 内容#运营", "101010100"));
  assert.equal(url.origin, "https://www.zhipin.com");
  assert.equal(url.pathname, "/web/geek/job");
  assert.equal(url.searchParams.get("query"), "AI & 内容#运营");
  assert.equal(url.searchParams.get("city"), "101010100");
});

test("only safe BOSS job detail links are accepted", () => {
  assert.equal(bossJobUrl("/job_detail/abc_123-xx.html?ka=search#frag"), "https://www.zhipin.com/job_detail/abc_123-xx.html?ka=search");
  for (const value of [null, "", "javascript:alert(1)", "https://evil.test/job_detail/abc.html", "https://www.zhipin.com.evil.test/job_detail/a.html", "http://www.zhipin.com/job_detail/a.html", "https://u:p@www.zhipin.com/job_detail/a.html", "https://www.zhipin.com:8443/job_detail/a.html", "/web/geek/job", "/job_detail/a.html/extra"]) assert.equal(bossJobUrl(value), null, String(value));
});

test("cards retain actual extracted values, omit unsafe cards and deduplicate job IDs", () => {
  const offers = normalizeBossCards([
    { href: "/job_detail/one.html", title: " 内容\n运营 ", company: "公司", salary: "10-15K", experience: "1-3年", education: "本科" },
    { href: "/job_detail/one.html?ka=other", title: "重复" },
    { href: "https://evil.test/job_detail/a.html", title: "恶意" },
    { href: "/job_detail/no-title.html" },
  ], "运营");
  assert.equal(offers.length, 1);
  assert.deepEqual(offers[0], { id: "one", title: "内容 运营", company: "公司", location: "", salary: "10-15K", experience: "1-3年", education: "本科", url: "https://www.zhipin.com/job_detail/one.html", source: "BOSS直聘", keyword: "运营" });
});

test("verification and login take precedence over stale visible job cards", () => {
  const base = { url: "https://www.zhipin.com/web/geek/job", hasCards: true };
  assert.equal(bossPageStatus({ ...base, text: "安全验证" }).status, "blocked");
  assert.equal(bossPageStatus({ ...base, text: "扫码登录" }).status, "login_required");
  assert.equal(bossPageStatus({ ...base, text: "短信登录 手机验证码" }).status, "login_required");
  assert.equal(bossPageStatus({ ...base, text: "图形验证码" }).status, "blocked");
  assert.equal(bossPageStatus({ ...base, text: "", httpStatus: 429 }).status, "blocked");
  assert.equal(bossPageStatus({ ...base, text: "", httpStatus: 500 }).status, "error");
  assert.equal(bossPageStatus({ ...base, text: "" }).status, "ok");
  assert.equal(bossPageStatus({ url: "https://www.zhipin.com/web/geek/job", text: "暂无相关职位" }).status, "ok");
  assert.equal(bossPageStatus({ url: "https://www.zhipin.com/web/geek/job", text: "普通页面" }).status, "error");
  assert.equal(bossPageStatus({ url: "about:blank" }).status, "login_required");
  assert.equal(bossPageStatus({ url: "https://evil.test/", hasCards: true }).status, "login_required");
});

test("obfuscated private-use salary glyphs are never returned as amounts", () => {
  assert.equal(normalizeBossCards([{ href: "/job_detail/pay.html", title: "运营", salary: "\uE033\uE031-\uE035\uE031K" }], "运营")[0].salary, "");
});
