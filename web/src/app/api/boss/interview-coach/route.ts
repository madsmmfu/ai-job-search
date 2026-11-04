import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 150;
const MAX_AUDIO = 20 * 1024 * 1024;
function run(op: string, input?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [rootScript("boss-interview-coach"), op], { cwd: careerOpsRoot(), env: { ...process.env, CAREER_OPS_ROOT: careerOpsRoot() }, timeout: op === "transcribe" ? 135000 : op === "assess" ? 100000 : 10000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { try { reject(new Error(JSON.parse(stderr.trim()).error)); } catch { reject(new Error("面试训练暂不可用，请稍后重试。")); } }
      else { try { resolve(JSON.parse(stdout)); } catch { reject(new Error("面试训练返回格式无效。")); } }
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(JSON.stringify(input || {}));
  });
}
export async function GET() {
  try { return Response.json(await run("jobs")); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 500 }); }
}
export async function POST(request: Request) {
  const url = new URL(request.url), origin = request.headers.get("origin");
  if (origin && origin !== `${url.protocol}//${request.headers.get("host") || url.host}`) return Response.json({ error: "请从本地 AI直聘操作。" }, { status: 403 });
  try {
    if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      const declared = Number(request.headers.get("content-length"));
      if (!Number.isFinite(declared) || declared <= 0 || declared > MAX_AUDIO + 65536) throw new Error("录音上传需要有效大小，最大 20 MB。");
      const reader = request.body?.getReader();
      if (!reader) throw new Error("录音数据为空。");
      const chunks: Uint8Array[] = []; let total = 0;
      while (true) { const chunk = await reader.read(); if (chunk.done) break; total += chunk.value.byteLength; if (total > MAX_AUDIO + 65536) { await reader.cancel(); throw new Error("录音超过 20 MB。"); } chunks.push(chunk.value); }
      const bounded = new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type")! }, body: Buffer.concat(chunks) });
      const body = await bounded.formData(), audio = body.get("audio");
      if (!(audio instanceof File) || !audio.size || audio.size > MAX_AUDIO) throw new Error("请选择不超过 20 MB 的录音。");
      const allowed: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/mpeg": "mp3" };
      const extension = allowed[audio.type.split(";")[0]];
      if (!extension) throw new Error("录音格式不支持。");
      const directory = path.join(careerOpsRoot(), "data/interview-coach-recordings");
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const id = `${randomUUID()}.${extension}`;
      await fs.writeFile(path.join(directory, id), Buffer.from(await audio.arrayBuffer()), { mode: 0o600, flag: "wx" });
      return Response.json({ status: "saved", id, transcriptionStatus: "not_transcribed", message: "录音已私有保存在本机。可点击本地语音转写，再核对文字并分析回答。" });
    }
    const text = await request.text();
    if (text.length > 30000) throw new Error("请求过长。");
    const input = JSON.parse(text);
    if (!input || !["prepare", "assess", "transcribe"].includes(input.op)) throw new Error("不支持的面试训练操作。");
    return Response.json(await run(input.op, input));
  } catch (error) { return Response.json({ error: (error as Error).message }, { status: 400 }); }
}
