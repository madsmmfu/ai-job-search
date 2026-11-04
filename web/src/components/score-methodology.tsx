import { ChevronDown, ExternalLink } from "lucide-react";

// Transparency = our differentiator ("why it's a 4.0 for YOU"). The wording is
// the CANONICAL public text from career-ops.org/methodology + /docs — rendered
// verbatim, NOT a web reinterpretation of the rubric (whose weights live in the
// core, modes/_shared.md). Native <details> → no client JS.

const DIMENSIONS: [string, string][] = [
  ["匹配度", "简历与岗位要求的匹配程度"],
  ["职业目标契合度", "岗位对实现职业目标的帮助"],
  ["薪资待遇", "岗位薪资与市场水平的对比（缺少薪资时标记为“数据不足”）"],
  ["文化信号", "招聘信息体现的团队、价值观和工作方式"],
  ["风险信号", "虚假招聘、诈骗或岗位不符的风险提示"],
  ["综合评分", "综合上述维度得出的总体评分"],
];

const BLOCKS: [string, string][] = [
  ["A", "用清晰语言概述岗位"],
  ["B", "逐项列出简历与岗位要求的匹配程度、要求的重要性及差距"],
  ["C", "申请策略：如何展现自己与岗位的匹配之处"],
  ["D", "薪资调研：比较岗位薪资与市场水平"],
  ["E", "申请材料的个性化建议"],
  ["F", "面试准备：针对岗位选择 STAR 故事"],
  ["G", "招聘真实性：核实岗位是否真实，排查诈骗和虚假招聘"],
];

export function ScoreMethodology() {
  return (
    <details className="group mt-10 overflow-hidden rounded-2xl border border-border bg-surface/30">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-sm font-medium transition-colors hover:bg-surface-hover">
        AI直聘如何根据<span className="text-landing">你的经历</span>评分
        <ChevronDown className="ml-auto size-4 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-border px-5 py-4 text-sm">
        <p className="text-muted">
          每个岗位均从六个维度评分，范围为 <strong className="text-foreground">1.0–5.0</strong> 。{" "}
          <strong className="text-brand">4.0</strong> 是建议申请的分数线，低于此分数时，AI直聘不建议申请。
        </p>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">六个评估维度</div>
          <ul className="space-y-1.5">
            {DIMENSIONS.map(([k, v]) => (
              <li key={k}>
                <span className="font-medium text-foreground">{k}</span> <span className="text-muted">— {v}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-faint">报告各章节说明</div>
          <ul className="space-y-2">
            {BLOCKS.map(([k, v]) => (
              <li key={k} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-brand-soft text-xs font-semibold text-brand">
                  {k}
                </span>
                <span className="text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </div>
        <a
          href="https://career-ops.org/methodology"
          target="_blank"
          rel="noreferrer"
          aria-label="完整评估方法（在新标签页打开）"
          className="inline-flex min-h-[24px] items-center gap-1 text-xs text-brand transition-colors hover:underline max-sm:min-h-[44px]"
        >
          完整评估方法 <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
    </details>
  );
}
