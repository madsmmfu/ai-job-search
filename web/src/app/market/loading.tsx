import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto max-w-7xl space-y-6 px-5 py-8 md:px-8" aria-label="正在加载市场与职业分析"><Skeleton className="h-9 w-64" /><Skeleton className="h-28 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div><div className="grid gap-6 lg:grid-cols-2"><Skeleton className="h-96 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></div></div>;
}
