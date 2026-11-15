import React from 'react'
import type { AuctionEvent } from '../types/api'
import { clsx } from 'clsx'

const EVT: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  BID_SUBMITTED:      { icon:'↓', color:'text-event-bid',   bg:'bg-event-bid/10',   label:'Bid' },
  RANK_CHANGED:       { icon:'⇅', color:'text-event-rank',  bg:'bg-event-rank/10',  label:'Rank Change' },
  EXTENSION_APPLIED:  { icon:'+', color:'text-event-ext',   bg:'bg-event-ext/10',   label:'Extended' },
  AUCTION_CLOSED:     { icon:'□', color:'text-event-close', bg:'bg-event-close/10', label:'Closed' },
  AUCTION_FORCE_CLOSED:{icon:'■', color:'text-red-400',     bg:'bg-red-400/10',     label:'Force Closed' },
  PUBLISHED:          { icon:'◈', color:'text-event-pub',   bg:'bg-event-pub/10',   label:'Published' },
  AUCTION_CANCELLED:  { icon:'×', color:'text-slate-600',   bg:'bg-white/[0.03]',   label:'Cancelled' },
}

function Detail({ e }: { e: AuctionEvent }) {
  const d = e.details
  if (e.event_type === 'EXTENSION_APPLIED') {
    const prev = d.previous_close_at as string
    const next = d.new_close_at as string
    const reasons = d.matched_reasons as string[] | undefined
    return (
      <span className="text-[11px] text-slate-700">
        {prev && next && <>{new Date(prev).toLocaleTimeString()} → <span className="text-event-ext">{new Date(next).toLocaleTimeString()}</span></>}
        {reasons && <span className="text-slate-800 ml-1">({reasons.map(r => r.replace(/_/g,' ').toLowerCase()).join(', ')})</span>}
      </span>
    )
  }
  if (e.event_type === 'BID_SUBMITTED') return <span className="text-[11px] text-slate-700">Total: {String(d.total ?? '')}</span>
  if (e.event_type === 'RANK_CHANGED') return (
    <span className="text-[11px] text-slate-700">
      {d.from_rank ? `L${String(d.from_rank)}` : '—'} → <span className="text-event-rank">L{String(d.to_rank ?? '')}</span>
    </span>
  )
  return null
}

export function ActivityFeed({ events }: { events: AuctionEvent[] }) {
  if (!events.length) return (
    <div className="text-center py-8 text-slate-800 text-sm">No activity yet</div>
  )

  return (
    <div className="space-y-0.5">
      {[...events].reverse().map(e => {
        const c = EVT[e.event_type] ?? { icon:'·', color:'text-slate-600', bg:'bg-white/[0.03]', label: e.event_type }
        return (
          <div key={e.id} className="flex items-start gap-2.5 py-2.5 border-b border-white/[0.03] last:border-0">
            <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 mt-0.5', c.bg, c.color)}>
              {c.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx('text-xs font-semibold', c.color)}>{c.label}</span>
                <span className="text-[10px] text-slate-800 tabular flex-shrink-0">
                  {new Date(e.occurred_at).toLocaleTimeString()}
                </span>
              </div>
              <Detail e={e} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
