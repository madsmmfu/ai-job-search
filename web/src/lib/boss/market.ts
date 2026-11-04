import { execFile } from "node:child_process";
import { careerOpsRoot, rootScript } from "@/lib/career-ops";

export function runBossMarket(action: "report" | "save", input?: unknown): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [rootScript("boss-market"), action], {
      cwd: careerOpsRoot(), env: { ...process.env, CAREER_OPS_ROOT: careerOpsRoot() }, timeout: 20000, maxBuffer: 12 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      if (error) {
        let message = "市场分析失败，请检查本地数据。";
        try { message = JSON.parse(stderr.trim()).error || message; } catch {}
        reject(new Error(message));
      } else { try { resolve(JSON.parse(stdout)); } catch { reject(new Error("市场分析结果无效。")); } }
    });
    child.stdin?.end(action === "save" ? JSON.stringify(input) : undefined);
  });
}
