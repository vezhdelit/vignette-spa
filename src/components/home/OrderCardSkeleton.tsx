import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/** Loading placeholder matching the home-screen order card silhouette. */
export function OrderCardSkeleton() {
  return (
    <Card className="gap-0 rounded-[28px] bg-white/85 py-0 ring-0">
      <Card className="rounded-[28px] ring-0 [--card-spacing:--spacing(5)]">
        <CardContent className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <Skeleton className="h-14 w-12 rounded-xl bg-cloud" />
              <Skeleton className="h-4 max-w-[240px] flex-1 rounded-full bg-cloud" />
            </div>
            <Skeleton className="mt-6 h-3.5 w-3/4 rounded-full bg-cloud" />
          </div>
          <div className="relative -mt-1">
            <Skeleton className="size-16 rounded-full bg-cloud" />
            <Skeleton className="absolute top-0 right-0 size-4 rounded-full bg-[#dfe7f0]" />
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between bg-gradient-to-r from-[#cfe9ff] to-white/40 px-5 py-4">
        <div className="flex flex-1 items-center gap-3">
          <Skeleton className="size-9 rounded-lg bg-white/70" />
          <Skeleton className="h-3.5 w-1/2 rounded-full bg-white/70" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-7 rounded-full bg-white/70" />
          <Skeleton className="size-7 rounded-full bg-white/70" />
        </div>
      </div>
    </Card>
  )
}
