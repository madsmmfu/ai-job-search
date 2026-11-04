import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const MAX_CV_UPLOAD_BYTES = 10 * 1024 * 1024;
const runFile = promisify(execFile);
const EXEC_OPTIONS = { encoding: "utf8", timeout: 15_000, maxBuffer: 2 * 1024 * 1024 };

export function pdfExecutable({ platform = process.platform, env = process.env, access = fs.accessSync } = {}) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const pathValue = Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] || "";
  const directories = [...(platform === "win32" ? [] : ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]), ...pathValue.split(paths.delimiter)];
  for (const directory of directories) {
    if (!paths.isAbsolute(directory)) continue;
    const candidate = paths.join(directory, platform === "win32" ? "pdftotext.exe" : "pdftotext");
    try {
      access(candidate, platform === "win32" ? fs.constants.F_OK : fs.constants.X_OK);
      return candidate;
    } catch { /* Try the next installed location. */ }
  }
  return null;
}

// Run trusted local converters directly, never through the AI or a shell. Tests
// inject the runner so argv, resource limits and failures are exercised exactly.
export async function extractCvFile(filePath, {
  platform = process.platform,
  execute = runFile,
  findPdfExecutable = () => pdfExecutable({ platform }),
} = {}) {
  const extension = path.extname(filePath).toLowerCase();
  if ([".txt", ".md"].includes(extension)) {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await fs.promises.readFile(filePath)).trim();
    } catch {
      throw new Error("文本文件读取失败，请将简历保存为 UTF-8 编码的 TXT 或 Markdown 文件后重试。");
    }
    if (!text) throw new Error("简历文件没有文字，请检查文件内容后重新上传。");
    return { text, fallbackReason: null };
  }
  const word = [".docx", ".doc", ".rtf"].includes(extension);
  const pdf = extension === ".pdf";
  if (!word && !pdf) throw new Error("暂不支持此文件格式，请上传 PDF、Word、RTF、TXT 或 Markdown 简历。");
  if (word && platform !== "darwin") {
    throw new Error("此服务器暂不支持 Word 文件转换，请另存为 PDF 或 UTF-8 文本后上传。");
  }
  const executable = word ? "/usr/bin/textutil" : findPdfExecutable();
  if (!executable) {
    return { text: null, fallbackReason: "未找到 PDF 文字提取工具，请安装 pdftotext，或改用 UTF-8 TXT 文件。" };
  }
  try {
    const args = word ? ["-convert", "txt", "-stdout", filePath] : ["-enc", "UTF-8", filePath, "-"];
    const { stdout } = await execute(executable, args, EXEC_OPTIONS);
    const text = stdout.trim();
    if (text) return { text, fallbackReason: null };
    if (pdf) return { text: null, fallbackReason: "PDF 中没有可提取的文字，可能是扫描件；请先进行 OCR 文字识别，或上传 Word、TXT 简历。" };
    throw new Error("empty document");
  } catch {
    const message = pdf
      ? "PDF 文字提取失败，请检查文件是否损坏或加密；扫描件请先进行 OCR，或改用 Word、TXT 文件。"
      : "Word 文件文字提取失败，请检查文件是否损坏、加密或为空，或另存为 PDF、UTF-8 文本后重试。";
    if (pdf) return { text: null, fallbackReason: message };
    throw new Error(message);
  }
}
