"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Upload, FileText, Loader2, Check, AlertTriangle, Lock, ArrowRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/cn";
import { instrumentSerif } from "@/lib/fonts";
import { cvReadiness, parseCvStream, type CvSeed } from "@/lib/cv/quality";
import { ingestErrorMessage } from "@/lib/cv/ingest-error.mjs";
import { DEFAULT_FILTERS, filtersToParams } from "@/lib/explore";

type Phase = "input" | "parsing" | "review" | "saving" | "error";

function cliId(): string | null {
  try {
    return JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId || null;
  } catch {
    return null;
  }
}

const STYLE = `
.co-cvdrop{position:relative;border:1.5px dashed color-mix(in srgb, var(--fg) 22%, transparent);border-radius:1rem;transition:border-color .2s,background .2s}
.co-cvdrop[data-over="true"]{border-color:hsl(26 73% 51%);background:hsl(26 73% 51% /.05)}
.co-cvtrace{animation:co-rise .4s ease both}
`;

export function CvIngest({ onSaved }: { onSaved?: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [paste, setPaste] = useState("");
  const [over, setOver] = useState(false);
  const [trace, setTrace] = useState("");
  const [md, setMd] = useState("");
  const [seed, setSeed] = useState<CvSeed | null>(null);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const readiness = md ? cvReadiness(md) : null;

  // Stream the ingest, parsing markers live.
  const runStream = useCallback(async (init: RequestInit) => {
    setPhase("parsing");
    setTrace("正在读取简历…");
    setErr("");
    try {
      const r = await fetch("/api/cv/ingest", init);
      const failure = await ingestErrorMessage(r);
      if (failure) {
        setErr(failure);
        setPhase("error");
        return;
      }
      if (!r.body) {
        setErr("未收到响应。");
        setPhase("error");
        return;
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parsed = parseCvStream(buf);
        if (parsed.error) {
          setErr(parsed.error === "unreadable" ? "文件已上传，但未能提取可用简历内容。请确认文档含可选中文字，或上传 Word / 文本版本。" : "无法解析简历，请直接粘贴文本。");
          setPhase("error");
          return;
        }
        if (parsed.trace) setTrace(parsed.trace.split("\n").filter(Boolean).slice(-1)[0] || "正在读取简历…");
        if (parsed.markdown) setMd(parsed.markdown);
        if (parsed.seed) setSeed(parsed.seed);
      }
      const final = parseCvStream(buf);
      if (!final.markdown.trim()) {
        setErr("未能读取简历，请直接粘贴文本。");
        setPhase("error");
        return;
      }
      setMd(final.markdown);
      setSeed(final.seed);
      setPhase("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "数据传输错误");
      setPhase("error");
    }
  }, []);

  const ingestText = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setErr("内容为空，请粘贴简历文本。");
      setPhase("error");
      return;
    }
    // Pasted text is already readable. Same path as a .md/.txt drop — no CLI.
    // (PDF/DOCX still need a CLI below.)
    const id = cliId();
    if (!id) {
      setSeed(null);
      setMd(trimmed);
      setPhase("review");
      return;
    }
    void runStream({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: trimmed, cliId: id }) });
  };

  const ingestFile = (file: File) => {
    // .md/.txt/.markdown fast path — plain text, NO CLI needed, instant.
    if (/\.(md|markdown|txt)$/i.test(file.name)) {
      file
        .text()
        .then((t) => {
          if (!t.trim()) {
            setErr("文件内容为空，请直接粘贴简历文本。");
            setPhase("error");
            return;
          }
          setSeed(null);
          setMd(t.trim());
          setPhase("review");
        })
        .catch(() => {
          setErr("无法读取文件，请直接粘贴简历文本。");
          setPhase("error");
        });
      return;
    }
    // PDF/other → the user's CLI parses it. Needs a configured CLI.
    const id = cliId();
    if (!id) {
      setErr("needs-cli");
      setPhase("error");
      return;
    }
    const form = new FormData();
    form.append("file", file);
    form.append("cliId", id);
    void runStream({ method: "POST", body: form });
  };

  const [saveErr, setSaveErr] = useState("");
  const save = async () => {
    if (!md.trim()) {
      setSaveErr("简历内容为空，请重新粘贴。");
      return;
    }
    setSaveErr("");
    setPhase("saving");
    try {
      const r = await fetch("/api/cv", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: md }) });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        setSaveErr(d.error || "无法保存简历，请重试。");
        setPhase("review"); // keep the parsed CV so they don't lose it
        return;
      }
    } catch {
      setSaveErr("无法保存简历，请检查连接后重试。");
      setPhase("review");
      return;
    }
    onSaved?.();
    // WOW #1 — land in the Explorer with the CV-derived filters in the URL + run=1,
    // so the Explorer auto-fires the FREE scan itself (robust, no push/replaceState race).
    // GENEROUS first scan so it never comes back empty (that would kill the wow): roles
    // only + a wide 30-day window; location stays a refinement for the deepen step, NOT a
    // hard exclude (allow=[] passes everything). Recall over precision for the first reveal.
    const roles = seed?.roles?.length ? seed.roles : seed?.title ? [seed.title] : [];
    const f = { ...DEFAULT_FILTERS, ats: [...DEFAULT_FILTERS.ats], positive: roles, sinceDays: 30 };
    const qs = filtersToParams(f);
    router.push(`/explore?${qs}${qs ? "&" : ""}run=1`);
  };

  // ── INPUT ──
  if (phase === "input" || phase === "error") {
    return (
      <div className="space-y-3">
        <style>{STYLE}</style>
        <div
          className="co-cvdrop p-6"
          data-over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) ingestFile(f);
          }}
        >
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && paste.trim()) ingestText(paste.trim());
            }}
            placeholder="在这里粘贴简历，或拖入 PDF / .md 文件。无需整理格式，我们会帮你梳理。"
            className="h-32 w-full resize-none bg-transparent text-[14px] leading-relaxed outline-none placeholder:text-faint"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface/50 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-brand/40 hover:text-brand max-sm:min-h-[44px] max-sm:px-4"
            >
              <Upload className="size-3.5" /> 上传 PDF / Word
            </button>
            <input ref={fileRef} type="file" accept=".pdf,.md,.markdown,.txt,.docx,.doc,.rtf" hidden onChange={(e) => e.target.files?.[0] && ingestFile(e.target.files[0])} />
            <span className="inline-flex items-center gap-1 text-[11px] text-faint">
              <Lock className="size-3" /> 文件保存在本机，由你配置的 AI 解析。
            </span>
            <button
              type="button"
              disabled={!paste.trim()}
              onClick={() => ingestText(paste.trim())}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50 max-sm:min-h-[44px]"
            >
              读取简历 <ArrowRight className="size-4" />
            </button>
          </div>
        </div>
        {phase === "error" &&
          (err === "needs-cli" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[13px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3.5 shrink-0" />
              <span>读取 PDF 或 Word 文件需要先在设置中连接 AI CLI。粘贴文本或上传 .md / .txt 文件可直接开始。</span>
              <Link href="/config" className="ml-auto inline-flex items-center gap-1 rounded-md bg-amber-500/20 px-2.5 py-1 font-medium text-amber-700 transition hover:bg-amber-500/30 dark:text-amber-200">
                连接 AI CLI <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-[13px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" /> {err}
            </p>
          ))}
      </div>
    );
  }

  // ── PARSING (the 10s bridge) ──
  if (phase === "parsing") {
    return (
      <div className="rounded-2xl border border-border bg-surface/60 p-6 backdrop-blur-sm">
        <style>{STYLE}</style>
        <div className="flex items-center gap-2.5">
          <Loader2 className="size-4 animate-spin text-brand" />
          <span className={`${instrumentSerif.className} text-lg text-foreground`}>{trace || "正在读取简历…"}</span>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-500" /> 通过本机 AI 工具解析 · 用量以服务商记录为准
        </div>
        {md && <div className="co-cvtrace mt-4 max-h-40 overflow-hidden rounded-lg border border-border bg-surface/40 p-3 text-[11px] text-faint">{md.slice(0, 400)}…</div>}
      </div>
    );
  }

  // ── REVIEW (propose → confirm) ──
  return (
    <div className="rounded-2xl border border-border bg-surface/60 p-4 backdrop-blur-sm md:p-5">
      <style>{STYLE}</style>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FileText className="size-4 text-brand" />
        <h3 className={`${instrumentSerif.className} text-lg text-foreground`}>简历已整理，请核对后保存</h3>
        {readiness && (
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              readiness.scoreable ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            )}
          >
            {readiness.scoreable ? <Check className="size-3" /> : <AlertTriangle className="size-3" />}
            {readiness.scoreable ? "可以匹配岗位" : "内容仍需补充"}
          </span>
        )}
      </div>
      {readiness?.hint && <p className="mb-2 text-[12px] text-amber-600 dark:text-amber-400">{readiness.hint}</p>}
      {saveErr && (
        <p className="mb-2 flex items-center gap-1.5 text-[12px] text-red-500">
          <AlertTriangle className="size-3.5 shrink-0" /> {saveErr}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <textarea
          value={md}
          onChange={(e) => setMd(e.target.value)}
          className="h-72 w-full resize-none rounded-lg border border-border bg-surface/40 p-3 font-mono text-[12px] leading-relaxed outline-none focus:border-brand/40"
        />
        <div className="prose prose-sm dark:prose-invert h-72 max-w-none overflow-y-auto rounded-lg border border-border bg-surface/40 p-3 text-[13px]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={phase === "saving"}
          className="inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
        >
          {phase === "saving" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          保存并查找匹配岗位
        </button>
        <button
          type="button"
          onClick={() => {
            setMd("");
            setSeed(null);
            setPhase("input");
          }}
          className="inline-flex items-center gap-1.5 text-[13px] text-muted transition hover:text-foreground"
        >
          <RotateCcw className="size-3.5" /> 重新开始
        </button>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-faint">
          <Lock className="size-3" /> 保存至本机 cv.md
        </span>
      </div>
    </div>
  );
}
