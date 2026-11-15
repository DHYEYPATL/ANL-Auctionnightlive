import React from 'react'
import type { AuctionEvent } from '../types/api'
import { clsx } from 'clsx'
import { ArrowUpDown, TrendingDown, Clock, CheckCircle, XCircle, Zap } from 'lucide-react'

const eventConfig = {
  BID_SUBMITTED: { icon: TrendingDown, color: 'text-bid', bg: 'bg-bid/10', label: 'Bid Submitted' },
  RANK_CHANGED: { icon: ArrowUpDown, color: 'text-rank', bg: 'bg-rank/10', label: 'Rank Changed' },
  EXTENSION_APPLIED: { icon: Clock, color: 'text-extension', bg: 'bg-extension/10', label: 'Auction Extended' },
  AUCTION_CLOSED: { icon: CheckCircle, color: 'text-slate-400', bg: 'bg-slate-500/10', label: 'Auction Closed' },
  AUCTION_FORCE_CLOSED: { icon: XCircle, color: 'text-status-force-closed', bg: 'bg-status-force-closed/10', label: 'Force Closed' },
  PUBLISHED: { icon: Zap, color: 'text-accent', bg: 'bg-accent/10', label: 'Published' },
  AUCTION_CANCELLED: { icon: XCircle, color: 'text-status-cancelled', bg: 'bg-stone-500/10', label: 'Cancelled' },
}

function formatDetails(event: AuctionEvent): React.ReactNode {
  const d = event.details
  if (event.event_type === 'EXTENSION_APPLIED') {
    return (
      <span className="text-xs text-slate-500">
        {new Date(d.previous_close as string).toLocaleTimeString()} →{' '}
        <span className="text-extension">{new Date(d.new_close as string).toLocaleTimeString()}</span>
        {d.matched_reasons && (
          <span className="ml-2 text-slate-600">
            ({(d.matched_reasons as string[]).join(', ')})
          </span>
        )}
      </span>
    )
  }
  if (event.event_type === 'BID_SUBMITTED') {
    return <span className="text-xs text-slate-500">Total: {d.total as string}</span>
  }
  if (event.event_type === 'RANK_CHANGED') {
    return (
      <span className="text-xs text-slate-500">
        {d.from_rank ? `L${d.from_rank}` : '—'} → <span className="text-rank">L{d.to_rank}</span>
      </span>
    )
  }
  return null
}

export function ActivityFeed({ events }: { events: AuctionEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="text-slate-600 text-sm text-center py-8">No activity yet</div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {[...events].reverse().map((event) => {
        const cfg = eventConfig[event.event_type] ?? {
          icon: Zap, color: 'text-slate-400', bg: 'bg-slate-500/10', label: event.event_type,
        }
        const Icon = cfg.icon
        return (
          <div key={event.id} className="flex items-start gap-3 py-2.5 border-b border-white/[0.04] last:border-0">
            <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
              <Icon size={13} className={cfg.color} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={clsx('text-xs font-medium', cfg.color)}>{cfg.label}</span>
                <span className="text-xs text-slate-600 tabular flex-shrink-0">
                  {new Date(event.occurred_at).toLocaleTimeString()}
                </span>
              </div>
              {formatDetails(event)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
