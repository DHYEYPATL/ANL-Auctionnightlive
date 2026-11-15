/**
 * EmptyState — HD-RT-07: explicit empty state design per SRS §7.5.
 * Never flashes "No bids" before data loads.
 */
import React from 'react'
import { clsx } from 'clsx'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={clsx('flex flex-col items-center justify-center py-16 text-center', className)}>
      {icon && (
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4 text-slate-500">
          {icon}
        </div>
      )}
      <p className="text-slate-300 font-medium text-base">{title}</p>
      {description && <p className="text-slate-500 text-sm mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
