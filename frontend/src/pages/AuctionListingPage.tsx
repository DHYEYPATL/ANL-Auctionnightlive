import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import type { Rfq, RfqStatus } from '../types/api'
import { StatusBadge } from '../components/ui/Badge'
import { Countdown } from '../components/Countdown'
import { SkeletonCard } from '../components/ui/Skeleton'
import { Card } from '../components/ui/Card'
import { useAuth } from '../hooks/useAuth'
import { ChevronRight, Gavel } from 'lucide-react'

const STATUS_FILTERS: { label: string; value: RfqStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Scheduled', value: 'SCHEDULED' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Draft', value: 'DRAFT' },
]

function sortRfqs(rfqs: Rfq[]): Rfq[] {
  return [...rfqs].sort((a, b) => {
    // Active first
    if (a.status === 'ACTIVE' && b.status !== 'ACTIVE') return -1
    if (b.status === 'ACTIVE' && a.status !== 'ACTIVE') return 1
    // Then nearest close
    return new Date(a.current_close_at).getTime() - new Date(b.current_close_at).getTime()
  })
}

export default function AuctionListingPage() {
  const { user } = useAuth()
  const [rfqs, setRfqs] = useState<Rfq[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<RfqStatus | 'ALL'>('ALL')

  useEffect(() => {
    rfqApi.list()
      .then(data => setRfqs(sortRfqs(data)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = filter === 'ALL' ? rfqs : rfqs.filter(r => r.status === filter)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">
          {user?.role === 'BUYER' ? 'My Auctions' : 'Invited Auctions'}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {user?.role === 'BUYER' ? 'RFQs you\'ve created and published.' : 'Active invitations to bid.'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f.value
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-white/[0.04] text-slate-400 border border-white/[0.06] hover:text-slate-300'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-3">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-500">
          <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mb-4">
            <Gavel size={28} className="opacity-40" />
          </div>
          <p className="text-base font-medium text-slate-400">No auctions found</p>
          <p className="text-sm mt-1">
            {filter !== 'ALL' ? `No ${filter.toLowerCase()} auctions.` : 'Nothing here yet.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(rfq => (
            <Link key={rfq.id} to={`/auctions/${rfq.id}`}>
              <Card className="p-5 hover:border-accent/20 hover:bg-white/[0.03] transition-all duration-200 cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <StatusBadge status={rfq.status} />
                      <span className="text-xs text-slate-600">{rfq.reference_id}</span>
                    </div>
                    <h2 className="font-medium text-slate-200 truncate">{rfq.name}</h2>
                  </div>

                  <div className="flex items-center gap-8 ml-6 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-0.5">Current L1</p>
                      <p className="text-sm font-semibold tabular text-slate-200">
                        {rfq.current_l1_total ? `${rfq.currency} ${rfq.current_l1_total}` : '—'}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-0.5">Closes</p>
                      {rfq.status === 'ACTIVE' ? (
                        <Countdown targetDate={rfq.current_close_at} />
                      ) : (
                        <p className="text-sm tabular text-slate-400">
                          {new Date(rfq.current_close_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500 mb-0.5">Forced Close</p>
                      <p className="text-xs tabular text-slate-500">
                        {new Date(rfq.forced_close_at).toLocaleString()}
                      </p>
                    </div>

                    <ChevronRight size={16} className="text-slate-600 group-hover:text-accent transition-colors" />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
