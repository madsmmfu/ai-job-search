import test from "node:test";
import assert from "node:assert/strict";
import { createBossWebBridge, bridgeSearchUrl, sameSearch } from "../../src/lib/boss/webbridge.mjs";

const url = bridgeSearchUrl("内容运营", "101210100");
const card = { href: "/job_detail/one.html", title: "内容运营", company: "测试公司", salary: "10-20K" };
function fakeBridge(handler, timeoutMs = 100) {
  const calls = [];
  const bridge = createBossWebBridge({ timeoutMs, fetchImpl: async (endpoint, options) => {
    assert.equal(endpoint, "http://127.0.0.1:10086/command");
    const command = JSON.parse(options.body);
    assert.equal(command.session, "career-ops-boss-edge");
    calls.push(command);
    const data = await handler(command, options);
    return { ok: true, json: async () => data };
  } });
  return { bridge, calls };
}
const snap = (value = url) => ({ ok: true, data: { url: value, tree: [{ role: "heading", name: "职位列表", children: [] }] } });
const dom = (value = url) => ({ ok: true, data: { type: "string", value: JSON.stringify({ url: value, text: "职位列表", cards: [card] }) } });

test("existing Edge session status only reads snapshot and DOM", async () => {
  const { bridge, calls } = fakeBridge(({ action }) => action === "snapshot" ? snap() : dom());
  assert.equal((await bridge.session()).status, "ok");
  assert.deepEqual(calls.map((item) => item.action), ["snapshot", "evaluate"]);
});

test("only missing session reacquires user's active BOSS tab", async () => {
  let missing = true;
  const { bridge, calls } = fakeBridge(({ action, args }) => {
    if (action === "snapshot" && missing) { missing = false; return { ok: false, error: { message: 'session "career-ops-boss-edge" has no tab — navigate or find_tab first' } }; }
    if (action === "find_tab") { assert.equal(args.active, true); return { ok: true, data: { success: true, url } }; }
    return action === "snapshot" ? snap() : dom();
  });
  assert.equal((await bridge.session()).status, "ok");
  assert.deepEqual(calls.map((item) => item.action), ["snapshot", "find_tab", "snapshot", "evaluate"]);
});

test("network failure does not reacquire or navigate", async () => {
  const { bridge, calls } = fakeBridge(() => { throw new Error("offline"); });
  assert.equal((await bridge.session()).status, "error");
  assert.equal(calls.length, 1);
});

test("open reuses logged Edge tab without navigating to login", async () => {
  const { bridge, calls } = fakeBridge(({ action }) => action === "find_tab" ? { ok: true, data: { success: true, url } } : action === "snapshot" ? snap() : dom());
  assert.equal((await bridge.open()).status, "ok");
  assert.deepEqual(calls.map((item) => item.action), ["find_tab", "snapshot", "evaluate"]);
});

test("navigation timeout accepts actual loaded requested search with no repeated navigation", async () => {
  const { bridge, calls } = fakeBridge(({ action }, options) => {
    if (action === "navigate") return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true }));
    return action === "snapshot" ? snap() : dom();
  }, 10);
  const result = await bridge.search(["内容运营"], "101210100");
  assert.equal(result.status, "ok");
  assert.equal(result.offers[0].title, "内容运营");
  assert.equal(calls.filter((item) => item.action === "navigate").length, 1);
  assert.equal(new URL(calls.find((item) => item.action === "navigate").args.url).pathname, "/web/geek/jobs");
});

test("stale previous-query cards after timeout cannot be returned", async () => {
  const { bridge } = fakeBridge(({ action }) => {
    if (action === "navigate") throw new Error("timeout");
    const previous = bridgeSearchUrl("旧关键词", "101210100");
    return action === "snapshot" ? snap(previous) : dom(previous);
  });
  const result = await bridge.search(["内容运营"], "101210100");
  assert.equal(result.status, "error");
  assert.deepEqual(result.offers, []);
});

test("captcha snapshot stops before evaluate or navigation", async () => {
  const { bridge, calls } = fakeBridge(() => ({ ok: true, data: { url, tree: [{ name: "安全验证" }] } }));
  assert.equal((await bridge.search(["内容运营"], "101210100")).status, "blocked");
  assert.deepEqual(calls.map((item) => item.action), ["snapshot"]);
});

test("same-search check matches only BOSS desired city/query", () => {
  assert.equal(sameSearch(url, url), true);
  assert.equal(sameSearch(url.replace("/jobs?", "/job?"), url), true);
  assert.equal(sameSearch(bridgeSearchUrl("内容运营", "100010000"), url), false);
  assert.equal(sameSearch(url.replace("www.zhipin.com", "evil.test"), url), false);
});
