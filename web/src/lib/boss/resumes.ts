import { execFile } from "node:child_process";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

export class BossResumeError extends Error {
  constructor(message: string, public status = 500) { super(message); }
}
export function runBossResume(action: "list" | "create" | "read", input?: unknown, id?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [rootScript("boss-resume"), action, ...(id ? [id] : [])], {
      cwd: careerOpsRoot(), env: { ...process.env, CAREER_OPS_ROOT: careerOpsRoot() }, timeout: 60000, maxBuffer: 15 * 1024 * 1024, encoding: "buffer",
    }, (error, stdout, stderr) => {
      if (error) {
        let message = "简历处理失败，请稍后重试。", status = 500;
        for (const line of stderr.toString().trim().split("\n").reverse()) {
          try { const parsed = JSON.parse(line); if(parsed.error) { message=parsed.error; status=parsed.status || 500; break; } } catch {}
        }
        reject(new BossResumeError(message,status));
      } else resolve(stdout);
    });
    if(action === "create") child.stdin?.end(JSON.stringify(input));
    else child.stdin?.end();
  });
}
export function parseResumeResult(buffer: Buffer) {
  // Core PDF rendering may log warnings before the final JSON response.
  const lines = buffer.toString().trim().split("\n");
  for(const line of lines.reverse()) { try { return JSON.parse(line); } catch {} }
  throw new BossResumeError("简历处理结果无效。");
}
