"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { GraduationCap, TriangleAlert } from "lucide-react";
import { skillGapModel, barPct, blockerText } from "@/lib/skill-gaps.mjs";
import type { SkillGapModel } from "@/lib/skill-gaps.mjs";

// 反复影响岗位匹配的能力差距, from the core's upskill.mjs via /api/upskill.
//
// On the CV page because this is the page for improving your candidacy, and the
// gaps are the difference between the CV as written and the roles being
// targeted. It is NOT a to-do list for the CV: upskill.mjs never adds a claim to
// cv.md, and neither does this — writing a skill you do not have into the
// document is the fabrication the project rules forbid.
//
// The weighting is the core's: a 2.1/5 report says more about a gap than a
// 4.5/5 one, so a skill that sinks low-fit roles outranks one mentioned often.
const TIER_CLASS: Record<string, string> = {
  High: "text-brand-text",
  Medium: "text-foreground",
  Low: "text-muted",
};

export function SkillGaps() {
  const [model, setModel] = useState<SkillGapModel | null>(null);
  // One counter for every in-flight load, not a per-call `alive` flag. Each
  // call owning its own flag meant two saves in quick succession raced: the
  // effect kept only the mount call's cleanup, so an older response arriving
  // last restored the gap map from before the edit — stale in the one place the
  // user just acted. Same generation guard today-dashboard.tsx uses.
  const generation = useRef(0);

  const load = useCallback(() => {
    const mine = ++generation.current;
    const isLatest = () => mine === generation.current;
    fetch("/api/upskill")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (isLatest()) setModel(skillGapModel(d)); })
      .catch(() => { if (isLatest()) setModel(skillGapModel(null)); });
  }, []);

  useEffect(() => {
    load();
    // The gap map subtracts the skills already in cv.md, so editing the CV
    // directly above this panel changes its answer. Loading once left the list
    // describing the document as it was before the save — stale in the one place
    // the user just acted.
    const onSaved = () => load();
    window.addEventListener("co-cv-saved", onSaved);
    return () => {
      window.removeEventListener("co-cv-saved", onSaved);
      // Unmount invalidates whatever is still in flight, so a late response
      // cannot setState on a gone component.
      generation.current += 1;
    };
  }, [load]);

  if (!model) {
    return (
      <section className="mt-8 rounded-2xl border border-border bg-surface/40 px-5 py-4">
        <div className="h-5 w-48 animate-pulse rounded bg-muted/25" aria-hidden />
        <div className="mt-3 h-24 w-full animate-pulse rounded bg-muted/25" aria-hidden />
      </section>
    );
  }

  // Silent when the script is absent — the CV editor is the page, and this is
  // context beside it.
  if (!model.available) return null;

  if (model.gaps.length === 0) {
    return (
      <section className="mt-8 rounded-2xl border border-border bg-surface/40 px-5 py-4">
        <Header />
        <p className="mt-2 text-sm text-muted">
          尚未发现反复出现的能力差距。完成几次评估后，这里会根据报告中的结构化摘要和差距表展示结果。
        </p>
        {/* The caveats belong here too. "No gaps" read off a CV whose skills
            could not be recognised, or off a fraction of the reports, is the
            most believable wrong answer this panel can give. */}
        <Caveats caveats={model.caveats} />
        <SkipBlockers blockers={model.blockers} skips={model.skips} />
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-surface/40 px-5 py-4">
      <Header />

      <Caveats caveats={model.caveats} />

      <div className="mt-4 grid gap-2.5">
        {model.gaps.map((g) => (
          <div key={g.skill} className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-sm text-foreground" title={g.skill}>
              {g.skill}
            </span>
            <div className="h-3.5 flex-1 overflow-hidden rounded-full bg-surface">
              <div className="h-full rounded-full bg-brand/60" style={{ width: `${barPct(g, model.gaps)}%` }} />
            </div>
            <span className={`w-16 shrink-0 text-right text-xs tabular-nums ${TIER_CLASS[g.tier] ?? "text-muted"}`}>
              {({ High: "高", Medium: "中", Low: "低" } as Record<string, string>)[g.tier] ?? g.tier ?? "—"}
            </span>
            <span className="w-24 shrink-0 text-right text-xs tabular-nums text-faint">
              {g.reports} 份报告
            </span>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-faint">
        按匹配度加权：低分岗位更能反映能力差距。这里的内容不会自动加入简历，请先补足能力，再更新简历。{" "}
        <Link href="/pipeline" className="text-muted underline-offset-2 hover:underline">
          查看报告
        </Link>
      </p>

      <SkipBlockers blockers={model.blockers} skips={model.skips} />
    </section>
  );
}

function SkipBlockers({ blockers, skips }: { blockers: SkillGapModel["blockers"]; skips: number }) {
  if (blockers.length === 0) return null;
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="text-sm text-foreground">最近跳过的 {skips} 个岗位有哪些门槛</h3>
      <p className="mt-0.5 text-xs text-faint">评估中被判定为缺失或仅部分满足的关键、高优先级要求。</p>
      <ul className="mt-3 grid gap-3">
        {blockers.map((b) => {
          const { verdict, nudge } = blockerText(b);
          return (
            <li key={b.label}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm text-foreground">{b.label}</span>
                <span className="text-xs tabular-nums text-brand-text">
                  {b.skips} / {skips} 次
                </span>
                <span className="text-xs text-muted">{verdict.replace(/missing in all (\d+)/g, "$1 次均缺失").replace(/partial in all (\d+)/g, "$1 次均部分满足").replace(/missing in (\d+), partial in (\d+)/g, "$1 次缺失，$2 次部分满足").replace(/(\d+) scored 3.5 or higher/g, "$1 次评分达到 3.5 及以上")}</span>
                <span className="ml-auto flex gap-2 text-xs tabular-nums text-faint">
                  {b.reports.slice(0, 3).map((n) => (
                    <Link key={n} href={`/pipeline/${n}`} className="underline-offset-2 hover:underline">
                      #{n}
                    </Link>
                  ))}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-faint">{nudge === "Your CV does not show this. Learn it, or aim at roles that do not ask for it." ? "简历中未体现这项能力。可以学习补足，或寻找不要求此能力的岗位。" : nudge === "Your CV shows some of this. If you have done more, add a bullet with the scope and the result." ? "简历已部分体现这项能力。如果还有更多真实经历，请补充工作范围和成果。" : nudge}</p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The core's caveats, shared by the populated and empty panels. */
function Caveats({ caveats }: { caveats: SkillGapModel["caveats"] }) {
  return (
    <>
      {caveats.map((c) => (
        <p key={c.kind} className="mt-2 flex items-start gap-2 text-xs text-muted">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-faint" aria-hidden />
          <span>{c.kind === "no-known-skills" ? "未能从简历中识别已有技能，因此无法扣除已掌握的能力；部分差距可能是你已经具备的技能。" : c.text.replace(/^None of the (\d+) reports carry a Machine Summary — these come from Gap tables alone\.$/, "$1 份报告均无结构化摘要，以上结果仅来自差距表。").replace(/^Based on (\d+) of (\d+) reports — the rest carry no Machine Summary to read gaps from\.$/, "结果基于 $2 份报告中的 $1 份，其余报告缺少可读取差距的结构化摘要。")}</span>
        </p>
      ))}
    </>
  );
}

function Header() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GraduationCap className="size-4 text-brand" />
      <h2 className="font-display text-base text-landing">反复影响岗位匹配的能力差距</h2>
      <span className="text-xs text-faint">汇总已记录的岗位评估</span>
    </div>
  );
}
