import { Skeleton } from "@/components/ui/skeleton";
export default function Loading() { return <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 md:px-8" aria-label="正在加载面试训练"><Skeleton className="h-9 w-64" /><Skeleton className="h-36 rounded-2xl" /><Skeleton className="h-80 rounded-2xl" /></div>; }
