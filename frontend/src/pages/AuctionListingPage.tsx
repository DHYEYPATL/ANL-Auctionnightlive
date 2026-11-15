"use client"

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import type { Rfq, RfqStatus } from '../types/api'
import { useAuth } from '../hooks/useAuth'
import { StatusBadge } from '../components/ui/Badge'
import { Countdown } from '../components/Countdown'
import { Plus, Layers, ChevronRight } from 'lucide-react'

const FILTERS: { label: string; value: RfqStatus | 'ALL' }[] = [
  { label: 'All RFQs', value: 'ALL' },
  { label: 'Live Bidding', value: 'ACTIVE' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Draft', value: 'DRAFT' },
]

function sort(rfqs: Rfq[]) {
  return [...rfqs].sort((a, b) => {
    const order: Record<string, number> = { ACTIVE: 0, SCHEDULED: 1, DRAFT: 2, CLOSED: 3, FORCE_CLOSED: 4, CANCELLED: 5 }
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
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-fade-up">
      {/* Top Banner Card: Apple Luxury Header */}
      <div className="rounded-[30px] p-6 md:p-8 border border-white/[0.09] shadow-[0_25px_60px_rgba(0,0,0,0.8)] bg-[#0d121c]/88 backdrop-blur-2xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          {/* macOS window traffic lights */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
            <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase ml-2">
              BRITISH REVERSE AUCTION FLOOR
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-cream uppercase">
            {user?.role === 'BUYER' ? 'My Auctions & RFQs' : 'Invited Auction Floor'}
          </h1>
          <p className="text-xs text-cream-muted mt-1.5 font-normal max-w-xl">
            {liveCount > 0 ? (
              <span>
                <span className="text-emerald-400 font-semibold font-mono">{liveCount} active floor{liveCount > 1 ? 's' : ''}</span> undergoing real-time price decrementing and soft-close extensions.
              </span>
            ) : user?.role === 'BUYER' ? (
              'Monitor RFQs, configure auto-extension rules, and invite suppliers to submit decrement bids.'
            ) : (
              'Submit competitive decrement quotes on active RFQs before the scheduled close countdown.'
            )}
          </p>
        </div>

        {user?.role === 'BUYER' && (
          <button
            onClick={() => navigate('/create')}
            className="w-full md:w-auto py-3 px-5 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all flex-shrink-0"
          >
            <Plus size={15} className="stroke-[2.5]" />
            <span>New Auction RFQ</span>
          </button>
        )}
      </div>

      {/* Status Filters: Styled like FAST SWITCH DEMO ROLES */}
      <div className="flex items-center justify-between gap-4 flex-wrap border-b border-white/[0.07] pb-4">
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-2 rounded-xl text-xs font-mono transition-all ${
                filter === f.value
                  ? 'bg-[#f4ebe1] text-black font-semibold shadow-md'
                  : 'bg-[#0b101a]/75 hover:bg-white/[0.06] border border-white/10 text-slate-300'
              }`}
            >
              {f.label}
              {f.value === 'ACTIVE' && liveCount > 0 && (
                <span className="ml-2 w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-ping" />
              )}
            </button>
          ))}
        </div>

        <span className="text-xs text-cream-muted font-mono bg-white/[0.04] px-3 py-1 rounded-full border border-white/[0.06]">
          {filtered.length} auction{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Auction List */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyAuctions isBuyer={user?.role === 'BUYER'} onNew={() => navigate('/create')} />
      ) : (
        <div className="space-y-4">
          {filtered.map(rfq => <AuctionCard key={rfq.id} rfq={rfq} />)}
        </div>
      )}
    </div>
  )
}

function AuctionCard({ rfq }: { rfq: Rfq }) {
  const isLive = rfq.status === 'ACTIVE'

  return (
    <Link to={`/auctions/${rfq.id}`}>
      <div
        className={`rounded-[28px] p-6 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.7)] bg-[#0d121c]/88 backdrop-blur-2xl transition-all duration-200 cursor-pointer relative group hover:border-white/20 ${
          isLive ? 'border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.12)]' : ''
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
              <StatusBadge status={rfq.status} />
              <span className="text-xs text-cream-muted font-mono bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/[0.06]">
                {rfq.reference_id}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-cream-muted font-mono">{rfq.currency}</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-400">Date: {rfq.service_date}</span>
            </div>

            <h3 className="text-base md:text-lg font-bold text-cream group-hover:text-white transition-colors tracking-tight">
              {rfq.name}
            </h3>

            <div className="flex flex-wrap items-center gap-3.5 mt-2.5 text-xs text-slate-400 font-mono">
              <span>{rfq.participating_supplier_count} supplier{rfq.participating_supplier_count !== 1 ? 's' : ''}</span>
              <span className="text-slate-600">·</span>
              <span>{rfq.accepted_bid_count} accepted bid{rfq.accepted_bid_count !== 1 ? 's' : ''}</span>
              {rfq.extension_count > 0 && (
                <>
                  <span className="text-slate-600">·</span>
                  <span className="text-emerald-400 font-medium">
                    +{rfq.extension_count} soft-close extension{rfq.extension_count !== 1 ? 's' : ''}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-6 flex-shrink-0 pt-4 md:pt-0 border-t md:border-t-0 border-white/[0.06]">
            {/* L1 Best Price Box */}
            <div className="p-3 rounded-2xl bg-[#080c14]/80 border border-white/10 text-left md:text-right min-w-[130px]">
              <p className="text-[9px] text-cream-muted font-mono uppercase tracking-wider mb-0.5">Current Lowest (L1)</p>
              <p className="text-base font-bold font-mono text-cream">
                {rfq.current_l1_total ? `${rfq.currency} ${Number(rfq.current_l1_total).toLocaleString()}` : 'Awaiting Bids'}
              </p>
            </div>

            {/* Current Close & Countdown */}
            <div className="text-right min-w-[110px]">
              <p className="text-[9px] text-cream-muted font-mono uppercase tracking-wider mb-1">
                {isLive ? 'Closes in' : rfq.status === 'SCHEDULED' ? 'Starts' : 'Closed'}
              </p>
              {isLive ? (
                <Countdown targetDate={rfq.current_close_at} />
              ) : rfq.status === 'SCHEDULED' ? (
                <span className="text-xs text-blue-400 font-mono">
                  {new Date(rfq.start_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-xs text-slate-500 font-mono">
                  {new Date(rfq.current_close_at).toLocaleDateString()}
                </span>
              )}
              <p className="text-[9px] text-slate-500 font-mono mt-1">
                Hard Stop: {new Date(rfq.forced_close_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>

            {/* Chevron pill */}
            <div className="w-8 h-8 rounded-full bg-white/[0.05] border border-white/10 flex items-center justify-center text-slate-400 group-hover:text-cream group-hover:bg-white/[0.1] transition-all">
              <ChevronRight size={15} />
            </div>
          </div>
        </div>

        {/* Live progress indicator bar */}
        {isLive && (
          <div className="mt-4 h-0.5 w-full overflow-hidden rounded-full bg-white/[0.05]">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 animate-pulse" />
          </div>
        )}
      </div>
    </Link>
  )
}

function EmptyAuctions({ isBuyer, onNew }: { isBuyer: boolean; onNew: () => void }) {
  return (
    <div className="rounded-[30px] p-12 border border-white/[0.08] bg-[#0d121c]/88 shadow-[0_20px_50px_rgba(0,0,0,0.7)] text-center flex flex-col items-center justify-center space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-white/[0.05] border border-white/10 flex items-center justify-center text-cream">
        <Layers size={22} />
      </div>
      <h3 className="text-lg font-bold text-cream tracking-tight uppercase">No RFQs Found</h3>
      <p className="text-xs text-cream-muted max-w-sm">
        {isBuyer ? 'Create your first British reverse auction RFQ to invite suppliers and run real-time bidding.' : 'Auctions you have been invited to will appear here once published.'}
      </p>
      {isBuyer && (
        <button
          onClick={onNew}
          className="py-2.5 px-5 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center gap-2 mt-2 shadow-lg transition-all"
        >
          <Plus size={14} className="stroke-[2.5]" />
          <span>Create Auction</span>
        </button>
      )}
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-[28px] p-6 border border-white/[0.06] bg-[#0d121c]/60 animate-pulse space-y-4">
      <div className="flex justify-between items-center">
        <div className="h-4 w-32 bg-white/10 rounded-lg" />
        <div className="h-4 w-20 bg-white/10 rounded-lg" />
      </div>
      <div className="h-6 w-64 bg-white/10 rounded-lg" />
      <div className="h-3 w-40 bg-white/5 rounded-lg" />
    </div>
  )
}
