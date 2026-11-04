import { ChevronDown } from "lucide-react";
import { prepQuestions, readMachineSummary } from "@/lib/machine-summary.mjs";

const IMPORTANCE_LABEL: Record<string, string> = { critical: "关键", high: "高", meaningful: "重要", low: "低", nice: "加分项" };

const MATCH_LABEL: Record<string, { text: string; className: string }> = {
  strong: { text: "展示证据", className: "text-emerald-600 dark:text-emerald-400" },
  partial: { text: "展现深度", className: "text-amber-600 dark:text-amber-400" },
  missing: { text: "补足计划", className: "text-red-600 dark:text-red-400" },
};

export function PrepPack({ report, company }: { report: string; company: string }) {
  const summary = readMachineSummary(report);
  const questions = summary ? prepQuestions(summary) : [];
  if (questions.length === 0) return null;
  return (
    <details data-testid="prep-pack" className="group mt-3 overflow-hidden rounded-xl border border-border bg-surface/30">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-hover">
        <span className="text-sm font-medium">面试准备</span>
        <span className="hidden truncate text-xs text-faint sm:inline">
          围绕岗位核心要求的 {questions.length} 个高频面试问题
        </span>
        <ChevronDown className="ml-auto size-4 shrink-0 text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border px-4 py-3">
        <ol className="space-y-3">
          {questions.map((q) => (
            <li key={q.requirement} className="text-sm">
              <p className="text-foreground">{q.question.replace(/^Walk me through your strongest example of (.*)\. What was the outcome\?$/, "请分享你在 $1 方面最有说服力的经历，结果如何？").replace(/^Where have you used (.*), and how deep did you go\?$/, "你在哪些场景使用过 $1，实践深度如何？").replace(/^The role asks for (.*)\. How would you close that gap\?$/, "这个岗位要求 $1，你准备如何补足这方面的差距？")}</p>
              <p className="mt-0.5 text-xs text-faint">
                {q.requirement} · {IMPORTANCE_LABEL[q.importance] ?? q.importance} ·{" "}
                <span className={MATCH_LABEL[q.match].className}>{MATCH_LABEL[q.match].text}</span>
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted">
          为每个问题准备一个面试计划中的 STAR 故事。如需答案草稿和公司简介，请在 AI 工具中运行{" "}
          <code className="text-foreground">/career-ops interview-prep</code> ，为 {company || "该岗位"} 做准备。
        </p>
      </div>
    </details>
  );
}
