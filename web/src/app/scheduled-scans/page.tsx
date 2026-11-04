import { redirect } from "next/navigation";
import { bossOnlySearch } from "@/lib/search-source-policy.mjs";
import { ScheduledJobsView } from "@/components/scheduled-jobs-view";

export const dynamic = "force-dynamic";

export default function ScheduledScansPage() {
  if (bossOnlySearch()) redirect("/explore");
  return <ScheduledJobsView />;
}
