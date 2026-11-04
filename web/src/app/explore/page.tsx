import { BossExplorer } from "@/components/explore/boss-explorer";
import { seedExploreFilters } from "@/lib/core/portals";

export const dynamic = "force-dynamic";

export default function ExplorePage() {
  const { filters } = seedExploreFilters();
  return <BossExplorer seedKeywords={filters.positive} />;
}
