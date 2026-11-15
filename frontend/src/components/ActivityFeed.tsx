import React from 'react'
import type { AuctionEvent } from '../types/api'
import { clsx } from 'clsx'

const EVT: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  BID_SUBMITTED:       { icon: '↓', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30', label: 'Bid Accepted' },
  RANK_CHANGED:        { icon: '⇅', color: 'text-amber-300',   bg: 'bg-amber-500/15 border-amber-500/30',     label: 'Rank Updated' },
  EXTENSION_APPLIED:   { icon: '+', color: 'text-purple-400',  bg: 'bg-purple-500/15 border-purple-500/30',   label: 'Soft-Close Extension' },
  AUCTION_CLOSED:      { icon: '□', color: 'text-slate-400',   bg: 'bg-white/[0.06] border-white/10',         label: 'Auction Concluded' },
  AUCTION_FORCE_CLOSED:{ icon: '■', color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',         label: 'Hard Stop Triggered' },
  PUBLISHED:           { icon: '◈', color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',       label: 'Floor Opened' },
  AUCTION_CANCELLED:   { icon: '×', color: 'text-slate-500',   bg: 'bg-white/[0.04] border-white/10',         label: 'Cancelled' },
}

function Detail({ e }: { e: AuctionEvent }) {
  const d = e.details
  if (e.event_type === 'EXTENSION_APPLIED') {
    const prev = d.previous_close_at as string
    const next = d.new_close_at as string
    const reasons = d.matched_reasons as string[] | undefined
    return (
      <span className="text-[11px] text-slate-300 font-mono mt-0.5 block">
        {prev && next && (
          <>
            {new Date(prev).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} →{' '}
            <span className="text-purple-300 font-semibold">
              {new Date(next).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
        )}
        {reasons && <span className="text-slate-500 ml-1.5 font-sans">({reasons.map(r => r.replace(/_/g, ' ').toLowerCase()).join(', ')})</span>}
      </span>
    )
  }
  if (e.event_type === 'BID_SUBMITTED') {
    return <span className="text-[11px] text-slate-300 font-mono mt-0.5 block">Quote Total: {String(d.total ?? '')}</span>
  }
  if (e.event_type === 'RANK_CHANGED') {
    return (
      <span className="text-[11px] text-slate-300 font-mono mt-0.5 block">
        Rank {d.from_rank ? `L${String(d.from_rank)}` : '—'} → <span className="text-amber-300 font-bold">L{String(d.to_rank ?? '')}</span>
      </span>
    )
  }
  return null
}

export function ActivityFeed({ events }: { events: AuctionEvent[] }) {
  if (!events.length) {
    return (
      <div className="text-center py-8 text-cream-muted text-xs font-mono">
        Telemetry idle — awaiting first event
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {[...events].reverse().map(e => {
        const c = EVT[e.event_type] ?? { icon: '·', color: 'text-slate-400', bg: 'bg-white/[0.04] border-white/10', label: e.event_type }
        return (
          <div
            key={e.id}
            className="flex items-start gap-3 p-3 rounded-2xl bg-[#080c14]/75 border border-white/[0.06] transition-all hover:border-white/15"
          >
            <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 mt-0.5 border font-mono font-bold', c.bg, c.color)}>
              {c.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx('text-xs font-semibold tracking-tight', c.color)}>{c.label}</span>
                <span className="text-[10px] text-slate-400 font-mono tabular flex-shrink-0">
                  {new Date(e.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
