import React from 'react'
import { clsx } from 'clsx'
import type { RfqStatus } from '../../types/api'

const cfg: Record<RfqStatus, { label: string; dot?: string; cls: string }> = {
  ACTIVE:      { label: 'Live',         dot: '#10b981', cls: 'text-status-active  bg-status-active-m  border-status-active/25' },
  SCHEDULED:   { label: 'Scheduled',                   cls: 'text-status-scheduled bg-status-scheduled-m border-status-scheduled/25' },
  CLOSED:      { label: 'Closed',                      cls: 'text-status-closed bg-status-closed-m  border-status-closed/25' },
  FORCE_CLOSED:{ label: 'Force Closed',                cls: 'text-status-force-closed bg-status-force-m border-status-force-closed/25' },
  DRAFT:       { label: 'Draft',                       cls: 'text-status-draft   bg-white/[0.04]     border-white/10' },
  CANCELLED:   { label: 'Cancelled',                   cls: 'text-status-cancelled bg-white/[0.03]   border-white/[0.06]' },
}

export function StatusBadge({ status, className }: { status: RfqStatus; className?: string }) {
  const c = cfg[status] ?? { label: status, cls: 'text-slate-500 bg-white/[0.04] border-white/10' }
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border', c.cls, className)}>
      {c.dot && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{background: c.dot}} />}
      {c.label}
    </span>
  )
}
