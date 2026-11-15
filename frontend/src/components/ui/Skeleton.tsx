import React from 'react'
import { clsx } from 'clsx'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        'rounded bg-white/[0.06] animate-pulse',
        className
      )}
    />
  )
}

export function SkeletonRow() {
  return (
    <div className="flex gap-4 items-center py-3 px-4">
      <Skeleton className="w-8 h-5" />
      <Skeleton className="w-32 h-5 flex-1" />
      <Skeleton className="w-20 h-5" />
      <Skeleton className="w-24 h-5" />
      <Skeleton className="w-20 h-5" />
    </div>
  )
}

export function SkeletonCard() {
  return (
    <div className="glass-card rounded-xl p-5 space-y-3">
      <Skeleton className="w-32 h-4" />
      <Skeleton className="w-full h-7" />
      <Skeleton className="w-24 h-4" />
    </div>
  )
}
