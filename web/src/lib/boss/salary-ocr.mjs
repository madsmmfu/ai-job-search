import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveCodeRoot } from "../core/code-root.mjs";
import { promisify } from "node:util";

const run = promisify(execFile);
const source = join(resolveCodeRoot(process.cwd(), process.env), "scripts", "boss-salary-ocr.swift");
const origin = "https://www.zhipin.com";
let compile;

function visibleSalaryRects() {
  return { url: location.href, width: innerWidth, height: innerHeight,
    cards: Array.from(document.querySelectorAll(".job-card-box")).flatMap((card) => {
      const link = card.querySelector('a[href*="/job_detail/"]');
      const salary = card.querySelector(".job-salary, .salary");
      if (!link || !salary) return [];
      const r = salary.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) return [];
      return [{ url: link.href, x: r.x, y: r.y, width: r.width, height: r.height }];
    }) };
}

function parseValue(result) {
  return typeof result?.value === "string" ? JSON.parse(result.value) : result?.value;
}

function signature(page) {
  return JSON.stringify(page);
}

/** Match only visually recognized salary ranges inside each rendered salary box. */
export function matchBossSalaryOcr(page, rows) {
  if (!page?.width || !page?.height || !Array.isArray(rows)) return [];
  return (page.cards || []).flatMap((card) => {
    let url;
    try { url = new URL(card.url); } catch { return []; }
    const jobId = url.pathname.match(/^\/job_detail\/([\w-]+)\.html$/)?.[1];
    if (url.origin !== origin || !jobId) return [];
    const candidates = rows.filter((row) => {
      if (row.confidence < 0.7) return false;
      const x = row.x * page.width, y = row.y * page.height;
      const width = row.width * page.width, height = row.height * page.height;
      const overlap = Math.max(0, Math.min(x + width, card.x + card.width + 4) - Math.max(x, card.x - 4)) *
        Math.max(0, Math.min(y + height, card.y + card.height + 4) - Math.max(y, card.y - 4));
      return width > 0 && height > 0 && overlap / (width * height) > 0.8;
    }).map((row) => row.text.replace(/\s/g, "").replace(/[–—~～]/g, "-").replace(/[•・]/g, "·"))
      .filter((text) => /^\d+(?:\.\d+)?-\d+(?:\.\d+)?[Kk](?:[·.]\d{1,2}薪)?$/.test(text));
    const unique = [...new Set(candidates.map((text) => text.replace("k", "K")))];
    if (unique.length !== 1) return [];
    const [low, high] = unique[0].match(/\d+(?:\.\d+)?/g).map(Number);
    if (!(low > 0 && high >= low && high <= 1000)) return [];
    return [{ jobId, url: `${origin}${url.pathname}`, salaryText: unique[0], salaryVerified: true, salarySource: "BOSS页面截图本地OCR" }];
  });
}

async function recognizeScreenshot(bytes, timeoutMs) {
  const started = Date.now();
  if (!compile) compile = (async () => {
    const code = await readFile(source);
    const hash = createHash("sha256").update(code).digest("hex").slice(0, 16);
    const executable = join(tmpdir(), `career-ops-salary-ocr-${hash}`);
    try { await access(executable); }
    catch { await run("/usr/bin/swiftc", [source, "-o", executable], { timeout: timeoutMs, maxBuffer: 1024 * 1024 }); }
    return executable;
  })().catch((error) => { compile = undefined; throw error; });
  const executable = await compile;
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining <= 0) throw new Error("OCR timeout");
  return new Promise((resolve, reject) => {
    const child = spawn(/* turbopackIgnore: true */ executable, [], { stdio: ["pipe", "pipe", "ignore"] });
    const chunks = [];
    const timer = setTimeout(() => { child.kill(); reject(new Error("OCR timeout")); }, remaining);
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stdin.on("error", () => {});
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error("OCR unavailable"));
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch (error) { reject(error); }
    });
    child.stdin.end(bytes);
  });
}

/** Read current visible BOSS salaries. Caller coordinates browser lock; never navigates. */
export async function readBossSalaries(command, { recognize = recognizeScreenshot, platform = process.platform, timeoutMs = 15000 } = {}) {
  if (platform !== "darwin") return [];
  const started = Date.now();
  const remaining = () => Math.max(1, timeoutMs - (Date.now() - started));
  let timer;
  const work = async () => {
    const code = `JSON.stringify((${visibleSalaryRects.toString()})())`;
    const before = parseValue(await command("evaluate", { code }));
    if (!before?.url?.startsWith(`${origin}/web/geek/job`) || !before.cards?.length) return [];
    const screenshot = await command("screenshot", { format: "png" });
    if (typeof screenshot?.data !== "string" || screenshot.data.length > 32 * 1024 * 1024) return [];
    const rows = await recognize(Buffer.from(screenshot.data, "base64"), remaining());
    const after = parseValue(await command("evaluate", { code }));
    if (signature(before) !== signature(after)) return [];
    return matchBossSalaryOcr(before, rows);
  };
  try {
    return await Promise.race([work(), new Promise((resolve) => { timer = setTimeout(() => resolve([]), timeoutMs); })]);
  } catch { return []; }
  finally { clearTimeout(timer); }
}
