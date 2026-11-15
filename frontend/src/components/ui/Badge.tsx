import React from 'react'
import { clsx } from 'clsx'
import type { RfqStatus } from '../../types/api'

const statusConfig: Record<RfqStatus, { label: string; classes: string }> = {
  ACTIVE: {
    label: 'Active',
    classes: 'bg-status-active-muted text-status-active border-status-active/30',
  },
  SCHEDULED: {
    label: 'Scheduled',
    classes: 'bg-status-scheduled-muted text-status-scheduled border-status-scheduled/30',
  },
  CLOSED: {
    label: 'Closed',
    classes: 'bg-status-closed-muted text-status-closed border-status-closed/30',
  },
  FORCE_CLOSED: {
    label: 'Force Closed',
    classes: 'bg-status-force-closed-muted text-status-force-closed border-status-force-closed/30',
  },
  DRAFT: {
    label: 'Draft',
    classes: 'bg-white/[0.06] text-status-draft border-white/10',
  },
  CANCELLED: {
    label: 'Cancelled',
    classes: 'bg-white/[0.04] text-status-cancelled border-white/[0.06]',
  },
}

interface StatusBadgeProps {
  status: RfqStatus
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = statusConfig[status] ?? { label: status, classes: 'bg-white/10 text-slate-400 border-white/10' }
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        cfg.classes,
        className
      )}
    >
      {cfg.label === 'Active' && (
        <span className="w-1.5 h-1.5 rounded-full bg-status-active mr-1.5 animate-pulse" />
      )}
      {cfg.label}
    </span>
  )
}
