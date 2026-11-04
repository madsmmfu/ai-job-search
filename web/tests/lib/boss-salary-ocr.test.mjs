import test from "node:test";
import assert from "node:assert/strict";
import { matchBossSalaryOcr, readBossSalaries } from "../../src/lib/boss/salary-ocr.mjs";

const page = { url: "https://www.zhipin.com/web/geek/jobs?query=AI", width: 1000, height: 800,
  cards: [{ url: "https://www.zhipin.com/job_detail/test123.html?secret=discard", x: 300, y: 100, width: 100, height: 30 }] };
const row = { text: "9-12K·13薪", confidence: 0.99, x: 0.3, y: 0.125, width: 0.09, height: 0.03 };
test("normalized screenshot coordinates match salary box regardless of DPR", () => {
  assert.deepEqual(matchBossSalaryOcr(page, [row]), [{ jobId: "test123", url: "https://www.zhipin.com/job_detail/test123.html", salaryText: "9-12K·13薪", salaryVerified: true, salarySource: "BOSS页面截图本地OCR" }]);
});
test("rejects nearby text, uncertain OCR, private font and ambiguous salaries", () => {
  assert.deepEqual(matchBossSalaryOcr(page, [{ ...row, x: 0.1 }, { ...row, confidence: 0.5 }, { ...row, text: "-K" }]), []);
  assert.deepEqual(matchBossSalaryOcr(page, [row, { ...row, text: "12-20K" }]), []);
});
test("rejects inverted range and external URLs", () => {
  assert.deepEqual(matchBossSalaryOcr(page, [{ ...row, text: "20-10K" }]), []);
  assert.deepEqual(matchBossSalaryOcr({ ...page, cards: [{ ...page.cards[0], url: "https://evil.test/job_detail/test123.html" }] }, [row]), []);
});
test("page changes discard screenshot matches and unavailable mac OCR stays unknown", async () => {
  let calls = 0;
  const command = async (action) => action === "screenshot" ? { data: "aW1hZ2U=" } : { value: JSON.stringify(calls++ ? { ...page, url: page.url + "changed" } : page) };
  assert.deepEqual(await readBossSalaries(command, { platform: "darwin", recognize: async () => [row] }), []);
  assert.deepEqual(await readBossSalaries(command, { platform: "linux" }), []);
});
test("reads snapshot only and times out without inventing salary", async () => {
  const actions = [];
  const command = async (action) => { actions.push(action); return action === "screenshot" ? { data: "aW1hZ2U=" } : { value: JSON.stringify(page) }; };
  assert.equal((await readBossSalaries(command, { platform: "darwin", recognize: async () => [row] }))[0].salaryText, row.text);
  assert.deepEqual(actions, ["evaluate", "screenshot", "evaluate"]);
  assert.deepEqual(await readBossSalaries(command, { platform: "darwin", timeoutMs: 10, recognize: () => new Promise(() => {}) }), []);
});
