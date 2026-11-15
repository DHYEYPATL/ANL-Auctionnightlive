import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import type { Rfq } from '../types/api'
import { StatusBadge } from '../components/ui/Badge'
import { Countdown } from '../components/Countdown'
import { StandingsTable } from '../components/StandingsTable'
import { ActivityFeed } from '../components/ActivityFeed'
import { BidForm } from '../components/BidForm'
import { Card } from '../components/ui/Card'
import { Button } from '../components/ui/Button'
import { SkeletonRow } from '../components/ui/Skeleton'
import { useAuctionPolling } from '../hooks/useAuctionPolling'
import { useAuth } from '../hooks/useAuth'
import { Clock, TrendingDown, Users, Zap, AlertTriangle } from 'lucide-react'

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-semibold tabular text-slate-200">{value}</p>
      {sub && <p className="text-xs text-slate-600 mt-0.5">{sub}</p>}
    </Card>
  )
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [rfq, setRfq] = useState<Rfq | null>(null)
  const [rfqLoading, setRfqLoading] = useState(true)
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [publishing, setPublishing] = useState(false)

  const handlePublish = async () => {
    if (!id) return
    setPublishing(true)
    try {
      const updated = await rfqApi.publish(id)
      setRfq(updated)
      setNotification({ type: 'success', msg: `Auction published — status: ${updated.status}` })
    } catch {
      setNotification({ type: 'error', msg: 'Failed to publish auction.' })
    } finally {
      setPublishing(false)
    }
  }

  useEffect(() => {
    if (!id) return
    rfqApi.get(id).then(setRfq).finally(() => setRfqLoading(false))
  }, [id])

  const { standings, events, loading: pollLoading } = useAuctionPolling(
    id!,
    rfq?.status ?? 'DRAFT'
  )

  // Refresh RFQ on poll cycle to pick up close time changes
  useEffect(() => {
    if (!id || !rfq || !['ACTIVE', 'SCHEDULED'].includes(rfq.status)) return
    const interval = setInterval(() => {
      rfqApi.get(id).then(setRfq)
    }, 3000)
    return () => clearInterval(interval)
  }, [id, rfq?.status])

  if (rfqLoading) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-8 w-64 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-4 w-48 rounded bg-white/[0.06] animate-pulse" />
      </div>
    )
  }

  if (!rfq) {
    return (
      <div className="p-8 flex items-center gap-3 text-slate-400">
        <AlertTriangle size={20} />
        Auction not found or access denied.
      </div>
    )
  }

  const isBuyer = user?.role === 'BUYER'
  const isSupplier = user?.role === 'SUPPLIER'
  const myStanding = isSupplier && standings?.standings.find(
    s => s.supplier_label.startsWith('You')
  )

  return (
    <div className="p-8 max-w-6xl">
      {/* Force close banner */}
      {rfq.status === 'FORCE_CLOSED' && (
        <div className="mb-6 flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-3">
          <AlertTriangle size={18} className="text-red-400" />
          <span className="text-sm text-red-300 font-medium">Forced close reached — auction is permanently closed</span>
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
          notification.type === 'success'
            ? 'bg-extension/10 border-extension/30 text-extension'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        }`}>
          {notification.msg}
          <button onClick={() => setNotification(null)} className="ml-3 opacity-60 hover:opacity-100">×</button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <StatusBadge status={rfq.status} />
              <span className="text-xs text-slate-600">{rfq.reference_id}</span>
              <span className="text-xs text-slate-600">·</span>
              <span className="text-xs text-slate-600">{rfq.currency}</span>
              <span className="text-xs text-slate-600">·</span>
              <span className="text-xs text-slate-600">Service: {rfq.service_date}</span>
            </div>
            <h1 className="text-2xl font-semibold text-white tracking-tight">{rfq.name}</h1>
          </div>
          {rfq.status === 'DRAFT' && isBuyer && (
            <Button onClick={handlePublish} loading={publishing} variant="primary">
              Publish Auction
            </Button>
          )}
          {rfq.status === 'ACTIVE' && (
            <div className="glass-card rounded-xl px-4 py-3 text-right flex-shrink-0">
              <p className="text-xs text-slate-500 mb-1">Closes in</p>
              <Countdown targetDate={rfq.current_close_at} urgent />
            </div>
          )}
        </div>

        <div className="flex gap-6 mt-4 text-xs text-slate-500">
          <span>Bid Close: <span className="text-slate-400">{new Date(rfq.current_close_at).toLocaleString()}</span></span>
          <span>Forced Close: <span className="text-slate-400">{new Date(rfq.forced_close_at).toLocaleString()}</span></span>
          {rfq.published_at && <span>Published: <span className="text-slate-400">{new Date(rfq.published_at).toLocaleString()}</span></span>}
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryTile
          label="Current L1"
          value={standings?.current_l1_total ? `${rfq.currency} ${standings.current_l1_total}` : 'No bids'}
        />
        <SummaryTile label="Suppliers" value={String(rfq.participating_supplier_count)} />
        <SummaryTile label="Accepted Bids" value={String(rfq.accepted_bid_count)} />
        <SummaryTile label="Extensions" value={String(rfq.extension_count)} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Standings + bid form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <TrendingDown size={15} className="text-accent" />
              Current Standings
            </h2>
            {pollLoading && standings === null ? (
              <div className="space-y-1">
                {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
              </div>
            ) : (
              <StandingsTable
                standings={standings?.standings ?? []}
                currency={rfq.currency}
                isBuyer={isBuyer}
              />
            )}
          </Card>

          {/* Bid form for suppliers */}
          {isSupplier && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Zap size={15} className="text-accent" />
                Submit Bid
              </h2>
              <BidForm
                rfqId={rfq.id}
                currency={rfq.currency}
                status={rfq.status}
                previousTotal={myStanding ? myStanding.total_amount : null}
                serviceDate={rfq.service_date}
                onSuccess={msg => setNotification({ type: 'success', msg })}
                onError={msg => setNotification({ type: 'error', msg })}
              />
            </Card>
          )}

          {/* Auction config */}
          {rfq.auction_config && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                <Clock size={15} className="text-accent" />
                Auction Configuration
              </h2>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-slate-500 mb-1">Trigger Window</p>
                  <p className="text-slate-300 font-medium">{rfq.auction_config.trigger_window_minutes}m</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Extension Duration</p>
                  <p className="text-slate-300 font-medium">{rfq.auction_config.extension_duration_minutes}m</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">Triggers</p>
                  <div className="flex flex-wrap gap-1">
                    {rfq.auction_config.triggers.map(t => (
                      <span key={t} className="text-xs bg-accent/10 text-accent border border-accent/20 rounded px-1.5 py-0.5">
                        {t.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Activity feed */}
        <div>
          <Card className="p-5 h-fit sticky top-8">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Users size={15} className="text-accent" />
              Activity
            </h2>
            <ActivityFeed events={events} />
          </Card>
        </div>
      </div>
    </div>
  )
}
