"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, Check, Circle, CircleDashed } from "lucide-react";
import { readSavedCliId } from "@/lib/saved-cli";

// The "profile that grows while you talk": a live checklist of the four setup
// prerequisites plus the eight personalization sections, read from the same
// two signals the assistant gets (/api/doctor and /api/personalization) — never
// a parallel notion of "done". Refetches after every confirmed write
// (co-onboarding-changed) and after every finished worker (co-job-done), so a
// section flips to filled the moment its confirm card is accepted.

type Doctor = { available: boolean; onboardingNeeded: boolean; missing: string[] };
type Section = { id: string; heading: string; state: "filled" | "template" | "missing" };

// The same four keys /api/doctor reports in `missing`, so the panel cannot
// count itself done while doctor still says onboarding is incomplete.
// modes/_profile.md has no `ask` of its own: when it is absent its eight
// sections are all "missing", and the personalization line below asks for them.
const PREREQS: { key: string; label: string; ask?: string }[] = [
  { key: "cv.md", label: "简历", ask: "简历" },
  { key: "config/profile.yml", label: "求职资料：目标岗位、薪资和地点", ask: "求职资料（目标岗位、薪资和地点）" },
  { key: "modes/_profile.md", label: "个性化设置文件" },
  { key: "portals.yml", label: "待扫描的公司与岗位", ask: "待扫描的岗位和公司" },
];

const SECTION_LABELS: Record<string, string> = {
  targetRoles: "目标岗位", adaptiveFraming: "经历呈现策略", exitNarrative: "离职与转型说明",
  crossCuttingAdvantage: "综合优势", portfolio: "作品集与演示", compTargets: "薪资目标",
  negotiationScripts: "薪资谈判话术", locationPolicy: "工作地点偏好",
};

// Same reader the rest of the app uses, so "configured" cannot mean one thing
// here and another in Config (an empty-string cliId is not configured).
function hasCli(): boolean {
  return !!readSavedCliId();
}

export function OnboardingProgress({ compact = false }: { compact?: boolean }) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [sections, setSections] = useState<Section[] | null>(null);
  const [cli, setCli] = useState(true);

  const refetch = useCallback(() => {
    fetch("/api/doctor").then((r) => r.json()).then(setDoctor).catch(() => {});
    // A failed read keeps `sections` null (the panel says nothing): an empty
    // list would count as "every section done" and hide the panel.
    fetch("/api/personalization").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status))))).then((d) => setSections(Array.isArray(d.sections) ? d.sections : null)).catch(() => setSections(null));
  }, []);

  useEffect(() => {
    setCli(hasCli());
    refetch();
    window.addEventListener("co-onboarding-changed", refetch);
    window.addEventListener("co-job-done", refetch);
    return () => {
      window.removeEventListener("co-onboarding-changed", refetch);
      window.removeEventListener("co-job-done", refetch);
    };
  }, [refetch]);

  if (!doctor || !sections) return null;
  // doctor.available=false means "could not determine" — say nothing rather than guess.
  if (!doctor.available) return null;

  const missing = new Set(doctor.missing);
  const generic = sections.filter((s) => s.state !== "filled");
  const prereqDone = PREREQS.filter((p) => !missing.has(p.key)).length;
  const total = PREREQS.length + sections.length;
  const done = prereqDone + (sections.length - generic.length);
  if (done === total) return null; // fully personalized: the panel has done its job

  const asks = [
    ...PREREQS.filter((p) => missing.has(p.key)).flatMap((p) => (p.ask ? [p.ask] : [])),
    ...(generic.length ? [`个性化设置（${generic.map((s) => SECTION_LABELS[s.id] ?? s.heading.replace(/^## Your /, "")).join("、")}）`] : []),
  ];
  const kickoff = `请用中文帮我完成设置。待补充：${asks.join("；")}。请像招聘顾问整理求职资料一样，每次引导一两项，提出基于简历的建议，并让我逐项确认。不要重复询问已保存的内容。`;

  return (
    <aside className={`rounded-2xl border border-border bg-surface/40 ${compact ? "p-4" : "p-5"}`} aria-label="设置进度">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-foreground">逐步完善你的求职资料</h2>
        <span className="font-mono text-xs text-muted">{done}/{total}</span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-hover">
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>

      <ul className="mt-4 space-y-1.5 text-sm">
        {PREREQS.map((p) => (
          <Row key={p.key} state={missing.has(p.key) ? "missing" : "filled"} label={p.label} />
        ))}
        <li className="pt-2 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">个性化设置：岗位评估的依据</li>
        {sections.map((s) => (
          <Row key={s.id} state={s.state} label={SECTION_LABELS[s.id] ?? s.heading.replace(/^## Your /, "")} />
        ))}
      </ul>

      {cli ? (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("co-assistant", { detail: { message: kickoff } }))}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200"
        >
          <Sparkles className="size-4" /> 继续让助手帮我完善
        </button>
      ) : (
        <p className="mt-4 text-xs text-muted">
          在<a href="/config" className="text-foreground underline-offset-2 hover:underline">设置</a>中连接 AI 工具，让助手帮你填写。
        </p>
      )}
    </aside>
  );
}

function Row({ state, label }: { state: "filled" | "template" | "missing"; label: string }) {
  const Icon = state === "filled" ? Check : state === "template" ? CircleDashed : Circle;
  const tone = state === "filled" ? "text-foreground" : "text-muted";
  const hint = state === "template" ? "仍为示例" : state === "missing" ? "待补充" : "";
  return (
    <li className={`flex items-center gap-2 ${tone}`}>
      <Icon className={`size-3.5 shrink-0 ${state === "filled" ? "text-brand" : "text-faint"}`} aria-hidden />
      <span className="truncate">{label}</span>
      {hint && <span className="ml-auto shrink-0 text-[11px] text-faint">{hint}</span>}
    </li>
  );
}
