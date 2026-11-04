"use client";

import { useEffect, useState } from "react";
import { Building2, CircleCheck, CircleSlash, CircleHelp } from "lucide-react";
import { companyCardModel, isConclusion, factLine } from "@/lib/company-history.mjs";
import type { CompanyCardModel, Verdict } from "@/lib/company-history.mjs";

// What the tracker already knows about this company, from the core's
// company-history.mjs via /api/company-history.
//
// On the report because it answers the question that sits next to "should I
// apply?": have these people ever replied to me, and do they re-list this role?
// Both facts are already on disk and were previously CLI-only.
//
// The one thing this view must not do is turn "not checked" into "nothing
// found" — see lib/company-history.mjs for why the core draws that line and
// what it costs to lose it.
const EVIDENCE_LABELS: Record<string, string> = {
  "They have replied to you before": "该公司曾回复过你",
  "At least one application here moved past Applied.": "至少有一项申请已进入后续阶段。",
  "No reply so far": "暂未收到回复",
  "Applications here have passed the courtesy window without an answer.": "申请已超过通常等待时间，仍未收到回复。",
  "Mixed — replied to some, not others": "部分申请收到回复，部分未回复",
  "No history with this company yet": "暂时没有可判断的往来记录",
  "Nothing here has reached a stage that would show a reply either way.": "现有申请尚未到达可以判断回复情况的阶段。",
  "This company has re-listed roles": "该公司存在重复发布岗位",
  "Repeat postings were found in this company’s scan history; they may concern a different role.": "扫描记录中发现重复发布，可能涉及其他岗位。",
  "No repeat postings found": "未发现重复发布岗位",
  "Scan history was checked and no repeat postings were found for this company.": "已检查扫描记录，未发现该公司重复发布岗位。",
  "Repeat postings not checked": "尚未检查重复发布情况",
  "No scan history is loaded, so this says nothing either way.": "尚未加载扫描记录，无法判断重复发布情况。",
  "This is a job aggregator, where re-listing is normal and not a signal.": "这是招聘聚合平台，重复发布属于常见现象，不作为风险信号。",
  "Company history not checked": "尚未检查公司历史",
  "The tracker was not loaded, so this says nothing either way.": "申请记录未加载，无法判断历史往来情况。",
  "Not evaluated": "尚未评估"
};

function evidenceText(text: string): string {
  if (text.startsWith("marked `aggregator: true` in portals.yml")) return "该平台在 portals.yml 中标记为招聘聚合平台，相同岗位标题可能来自不同雇主。未对此平台评估重复发布情况，不能据此判断不存在重复发布。";
  return EVIDENCE_LABELS[text] ?? text
    .replace(/The core reported “(.*)”, which this view does not recognise yet\./, "核心返回了暂不支持的状态：“$1”。")
    .replace(/no reply recorded/g, "暂无回复记录")
    .replace(/no reply in (\d+) days/g, "$1 天未回复")
    .replace(/evaluated (\S+) \((\d+) days ago\)/g, "评估于 $1（$2 天前）")
    .replace(/applied (\S+)/g, "申请于 $1")
    .replace(/(\d+) follow-ups? sent/g, "已跟进 $1 次")
    .replace(/\bstale\b/g, "记录较旧");
}

const ICON = {
  finding: CircleCheck,
  absence: CircleSlash,
  "not-checked": CircleHelp,
} as const;

export function CompanyEvidence({ company }: { company: string }) {
  const [model, setModel] = useState<CompanyCardModel | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/company-history?company=${encodeURIComponent(company)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => alive && setModel(companyCardModel(d)))
      .catch(() => alive && setModel(companyCardModel(null)));
    return () => {
      alive = false;
    };
  }, [company]);

  if (!model) {
    return (
      <section className="mt-8 rounded-2xl border border-border bg-surface/40 px-5 py-4">
        <div className="h-5 w-40 animate-pulse rounded bg-muted/25" aria-hidden />
        <div className="mt-3 h-12 w-full animate-pulse rounded bg-muted/25" aria-hidden />
      </section>
    );
  }

  // Silent when unavailable. Unlike the keyword panel, this one adds context to
  // a page that reads fine without it, and "company-history.mjs isn't in this
  // checkout" is not something the reader can act on from here.
  if (!model.available) return null;

  const factLines = model.facts
    .slice(0, 5)
    .map((f) => factLine(f))
    .filter((l): l is string => typeof l === "string");

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface/40 px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Building2 className="size-4 text-brand" />
        <h2 className="font-display text-base text-landing">你与 {model.company ?? company} 的历史记录</h2>
      </div>

      <div className="mt-3 grid gap-2.5">
        <Row verdict={model.responsiveness} />
        <Row verdict={model.churn} />
      </div>

      {/* factLine() reads BOTH fact shapes: a responded fact has outcome+date, a
          silent one has silentDays+appliedDate and neither. Printing only the
          first pair rendered silent rows as "#4 · — " with no date. A fact with
          nothing to say returns null and is dropped rather than shown as
          punctuation. */}
      {factLines.length > 0 && (
        <ul className="mt-3 grid gap-1">
          {factLines.map((line, i) => (
            <li key={i} className="text-xs text-faint">
              {evidenceText(line)}
            </li>
          ))}
        </ul>
      )}

      {model.explanations.map((e, i) => (
        <p key={i} className="mt-3 text-xs text-muted">
          {evidenceText(e)}
        </p>
      ))}
    </section>
  );
}

function Row({ verdict }: { verdict: Verdict | null }) {
  if (!verdict) return null;
  const Icon = ICON[verdict.kind] ?? CircleHelp;
  return (
    <div className="flex items-start gap-2.5">
      <Icon
        className={`mt-0.5 size-4 shrink-0 ${isConclusion(verdict) ? "text-brand" : "text-faint"}`}
        aria-hidden
      />
      <div className="min-w-0">
        {/* A not-checked row is deliberately muted: it is the absence of a
            check, and it should not carry the visual weight of a finding. */}
        <p className={isConclusion(verdict) ? "text-sm text-foreground" : "text-sm text-muted"}>{evidenceText(verdict.headline)}</p>
        {verdict.detail && <p className="text-xs text-faint">{evidenceText(verdict.detail)}</p>}
      </div>
    </div>
  );
}
