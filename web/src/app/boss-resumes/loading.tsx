import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return <div className="mx-auto max-w-6xl px-6 py-8" aria-label="正在加载岗位简历"><Skeleton className="h-8 w-48" /><div className="mt-6 grid gap-6 lg:grid-cols-2"><Skeleton className="h-[600px] rounded-2xl" /><Skeleton className="h-[600px] rounded-2xl" /></div></div>;
}
