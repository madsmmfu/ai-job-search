"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, Settings } from "lucide-react";

type Doctor = { available: boolean; onboardingNeeded: boolean; missing: string[]; warnings: string[] };

function hasCli(): boolean {
  try {
    return !!JSON.parse(localStorage.getItem("career-ops:config") || "{}").cliId;
  } catch {
    return false;
  }
}

const LABELS: Record<string, string> = {
  "cv.md": "简历",
  "config/profile.yml": "求职资料（目标岗位、薪资和地点）",
  "modes/_profile.md": "个性化设置",
  "portals.yml": "待扫描的公司",
};

// Detect (via the core's doctor.mjs) whether setup is incomplete, and offer to
// finish it CONVERSATIONALLY — the assistant asks in plain language and writes
// the canonical files (no YAML to edit). This is the #1 adoption barrier.
export function OnboardingBanner() {
  const [d, setD] = useState<Doctor | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [cli, setCli] = useState(true); // assume until read (avoid CTA flash)

  useEffect(() => {
    setCli(hasCli());
    fetch("/api/doctor")
      .then((r) => r.json())
      .then(setD)
      .catch(() => {});
  }, []);

  if (dismissed || !d || !d.onboardingNeeded) return null;
  const items = d.missing.map((m) => LABELS[m] ?? m);
  const kickoff =
    `请用中文帮我完成 career-ops 的设置。还需补充：${items.join("、")}。请通过对话只引导我补充这些内容，并帮我写入文件。不要重复询问已经设置好的内容，例如已保存的简历。`;

  return (
    <div className="dot-bg relative mb-6 overflow-hidden rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 via-surface/40 to-transparent p-5">
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 text-faint transition-colors hover:text-foreground"
        aria-label="关闭"
      >
        <X className="size-4" />
      </button>
      <h2 className="font-display text-xl text-landing">完善你的求职设置</h2>
      <p className="mt-1.5 max-w-xl text-sm text-muted">
        了解你之后，AI直聘才能更好地匹配岗位。还需要补充：{items.join("、")}。{" "}
        <span className="text-foreground">无需编辑配置文件</span>，用日常语言回答，助手就会帮你完成。
      </p>
      {cli ? (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("co-assistant", { detail: { message: kickoff } }))}
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200"
        >
          <Sparkles className="size-4" /> 让助手帮我设置
        </button>
      ) : (
        // The assistant needs a CLI to run — without one the kickoff would silently
        // drop. Send them to connect one first.
        <Link
          href="/config"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand-200"
        >
          <Settings className="size-4" /> 连接 AI 工具并开始
        </Link>
      )}
    </div>
  );
}
