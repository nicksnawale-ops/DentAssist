import * as React from "react"
import { cn } from "../../lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-text-muted/10", className)}
      {...props}
    />
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-primary/5 bg-surface p-6 shadow-sm flex flex-col gap-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  )
}

export { Skeleton, SkeletonCard }
