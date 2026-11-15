import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import type { Rfq, RfqStatus } from '../types/api'
import { useAuth } from '../hooks/useAuth'
import { StatusBadge } from '../components/ui/Badge'
import { Countdown } from '../components/Countdown'

const FILTERS: { label: string; value: RfqStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Live', value: 'ACTIVE' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Draft', value: 'DRAFT' },
]

function sort(rfqs: Rfq[]) {
  return [...rfqs].sort((a, b) => {
    const order: Record<string, number> = { ACTIVE:0, SCHEDULED:1, DRAFT:2, CLOSED:3, FORCE_CLOSED:4, CANCELLED:5 }
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
    return new Date(a.current_close_at).getTime() - new Date(b.current_close_at).getTime()
  })
}

export default function AuctionListingPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rfqs, setRfqs] = useState<Rfq[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<RfqStatus | 'ALL'>('ALL')

  useEffect(() => {
    rfqApi.list().then(d => setRfqs(sort(d))).finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'ALL' ? rfqs : rfqs.filter(r => r.status === filter)
  const liveCount = rfqs.filter(r => r.status === 'ACTIVE').length

  return (
    <div className="p-7 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-grad tracking-tight">
            {user?.role === 'BUYER' ? 'My Auctions' : 'Invited Auctions'}
          </h1>
          <p className="text-slate-600 text-sm mt-1">
            {liveCount > 0
              ? <span><span className="text-status-active font-medium">{liveCount} live</span> auction{liveCount > 1 ? 's' : ''} in progress</span>
              : user?.role === 'BUYER' ? 'Create your first auction below' : 'No active auctions right now'}
          </p>
        </div>
        {user?.role === 'BUYER' && (
          <button onClick={() => navigate('/create')} className="btn-primary flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            New Auction
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-6">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.value
                ? 'bg-accent/15 text-accent-light border border-accent/25 shadow-glow-sm'
                : 'text-slate-500 hover:text-slate-300 border border-transparent hover:border-white/[0.06]'
            }`}>
            {f.label}
            {f.value === 'ACTIVE' && liveCount > 0 && (
              <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-status-active inline-block animate-pulse-soft" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyAuctions isBuyer={user?.role === 'BUYER'} onNew={() => navigate('/create')} />
      ) : (
        <div className="space-y-2.5">
          {filtered.map(rfq => <AuctionCard key={rfq.id} rfq={rfq} />)}
        </div>
      )}
    </div>
  )
}

function AuctionCard({ rfq }: { rfq: Rfq }) {
  return (
    <Link to={`/auctions/${rfq.id}`}>
      <div className="group glass rounded-2xl p-5 hover:border-accent/20 transition-all duration-200 cursor-pointer"
        style={{borderColor: rfq.status === 'ACTIVE' ? 'rgba(16,185,129,0.15)' : undefined}}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 mb-1.5">
              <StatusBadge status={rfq.status} />
              <span className="text-xs text-slate-700 font-mono">{rfq.reference_id}</span>
              <span className="text-xs text-slate-700">{rfq.currency}</span>
            </div>
            <h3 className="font-semibold text-slate-200 truncate group-hover:text-white transition-colors">{rfq.name}</h3>
            <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-600">
              <span>{rfq.participating_supplier_count} supplier{rfq.participating_supplier_count !== 1 ? 's' : ''}</span>
              <span>{rfq.accepted_bid_count} bid{rfq.accepted_bid_count !== 1 ? 's' : ''}</span>
              {rfq.extension_count > 0 && <span className="text-event-ext">{rfq.extension_count} extension{rfq.extension_count !== 1 ? 's' : ''}</span>}
            </div>
          </div>

          <div className="flex items-center gap-6 flex-shrink-0">
            {/* L1 */}
            <div className="text-right">
              <p className="text-[10px] text-slate-700 mb-0.5 uppercase tracking-wide">Best Bid</p>
              <p className="text-sm font-semibold tabular text-slate-200">
                {rfq.current_l1_total ? `${rfq.currency} ${rfq.current_l1_total}` : '—'}
              </p>
            </div>

            {/* Timer */}
            <div className="text-right min-w-[80px]">
              <p className="text-[10px] text-slate-700 mb-0.5 uppercase tracking-wide">
                {rfq.status === 'ACTIVE' ? 'Closes in' : rfq.status === 'SCHEDULED' ? 'Starts' : 'Closed'}
              </p>
              {rfq.status === 'ACTIVE' ? (
                <Countdown targetDate={rfq.current_close_at} />
              ) : rfq.status === 'SCHEDULED' ? (
                <span className="text-xs text-status-scheduled tabular">
                  {new Date(rfq.start_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-xs text-slate-700 tabular">
                  {new Date(rfq.current_close_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Arrow */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
              className="text-slate-700 group-hover:text-accent-light group-hover:translate-x-0.5 transition-all">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </div>
        </div>

        {/* Live progress bar */}
        {rfq.status === 'ACTIVE' && (
          <div className="mt-3 h-px w-full overflow-hidden rounded-full bg-white/[0.04]">
            <div className="h-full rounded-full animate-pulse-soft"
              style={{width:'100%', background:'linear-gradient(90deg, rgba(16,185,129,0.4), rgba(16,185,129,0.1))'}} />
          </div>
        )}
      </div>
    </Link>
  )
}

function EmptyAuctions({ isBuyer, onNew }: { isBuyer: boolean; onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl mb-5 flex items-center justify-center"
        style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)'}}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round">
          <path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      </div>
      <p className="text-slate-400 font-medium">No auctions here yet</p>
      <p className="text-slate-700 text-sm mt-1 max-w-xs">
        {isBuyer ? 'Create your first RFQ and invite suppliers to compete.' : 'You\'ll see auctions here once a buyer invites you.'}
      </p>
      {isBuyer && (
        <button onClick={onNew} className="btn-primary mt-5 flex items-center gap-2">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
          Create Auction
        </button>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-5 animate-pulse">
      <div className="flex justify-between">
        <div className="space-y-2 flex-1">
          <div className="h-4 w-24 rounded-lg bg-white/[0.05]" />
          <div className="h-5 w-64 rounded-lg bg-white/[0.04]" />
          <div className="h-3 w-32 rounded bg-white/[0.03]" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 rounded bg-white/[0.04]" />
          <div className="h-5 w-16 rounded bg-white/[0.03]" />
        </div>
      </div>
    </div>
  )
}
