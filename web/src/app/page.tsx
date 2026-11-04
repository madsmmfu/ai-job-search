import { readApplications, readInbox, readReport, doctorState } from "@/lib/career-ops";
import { pickAwaitingDecision } from "@/lib/home/awaiting.mjs";
import { cardReason } from "@/lib/machine-summary.mjs";
import type { CardReason } from "@/lib/machine-summary.mjs";
import { todaySnapshot } from "@/lib/home/today-snapshot.mjs";
import { scoreNum, parseReport } from "@/lib/format";
import { OnboardingBanner } from "@/components/onboarding-banner";
import { OnboardingProgress } from "@/components/home/onboarding-progress";
import { FirstRunHome } from "@/components/home/first-run-home";
import { TodayDashboard } from "@/components/home/today-dashboard";
import Link from "next/link";

export const dynamic = "force-dynamic"; // always read fresh local files at request time (never at build — CI has no user data)

export default function Home() {
  const snapshot = { applications: readApplications(), inbox: readInbox() };
  const { phase, onboardingNeeded } = doctorState(snapshot);
  // First run (truly empty install): the CV-upload takeover IS the home — value
  // before commitment. The full dashboard returns once they have a CV or any data.
  if (phase === "first-run") return <FirstRunHome />;

  const { inbox, applications } = todaySnapshot(snapshot, scoreNum);
  const reasons: Record<string, CardReason> = {};
  const legitimacy: Record<string, string> = {};
  for (const app of pickAwaitingDecision(applications, scoreNum)) {
    const content = readReport(app.n)?.content ?? "";
    const reason = cardReason(content);
    if (reason) reasons[app.n] = reason;
    const tier = parseReport(content).legitimacy;
    if (tier) legitimacy[app.n] = tier;
  }
  // Established / in-between: the dual-loop retention dashboard. Show the setup
  // banner whenever ANY prereq is missing (mirrors the core doctor.mjs), so a
  // portals-missing user is nudged rather than told "all caught up".
  return (
    <>
      <div className="mx-auto max-w-5xl px-6 pt-6"><Link href="/market" className="block rounded-xl border border-brand/20 bg-brand-soft p-5"><p className="font-semibold text-brand-text">先看市场，再决定下一步</p><p className="mt-1 text-sm text-muted">查看杭州岗位、薪资样本，以及与你的经历匹配的职业与提升建议 →</p></Link></div>
      {onboardingNeeded && <OnboardingBanner />}
      {/* The growing-profile panel stays until every prerequisite AND every
          personalization section is theirs — it renders nothing once complete. */}
      <div className="mx-auto max-w-5xl px-6 pt-6">
        <OnboardingProgress />
      </div>
      <TodayDashboard applications={applications} reasons={reasons} legitimacy={legitimacy} inbox={inbox} inBetween={phase === "in-between"} />
    </>
  );
}
