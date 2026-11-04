import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 md:px-8" aria-label="正在加载常驻求职助手"><Skeleton className="h-9 w-64" /><Skeleton className="h-48 rounded-2xl" /><div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-28 rounded-2xl" /></div><Skeleton className="h-72 rounded-2xl" /></div>;
}
