/** Loading placeholder matching the home-screen order card silhouette. */
export function OrderCardSkeleton() {
  return (
    <div className="animate-pulse overflow-hidden rounded-[28px] bg-white/85">
      <div className="rounded-[28px] bg-white p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-4">
              <div className="h-14 w-12 rounded-xl bg-cloud" />
              <div className="h-4 flex-1 max-w-[240px] rounded-full bg-cloud" />
            </div>
            <div className="mt-6 h-3.5 w-3/4 rounded-full bg-cloud" />
          </div>
          <div className="relative -mt-1">
            <div className="size-16 rounded-full bg-cloud" />
            <div className="absolute top-0 right-0 size-4 rounded-full bg-[#dfe7f0]" />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between bg-gradient-to-r from-[#cfe9ff] to-white/40 px-5 py-4">
        <div className="flex flex-1 items-center gap-3">
          <div className="size-9 rounded-lg bg-white/70" />
          <div className="h-3.5 w-1/2 rounded-full bg-white/70" />
        </div>
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-full bg-white/70" />
          <div className="size-7 rounded-full bg-white/70" />
        </div>
      </div>
    </div>
  )
}
