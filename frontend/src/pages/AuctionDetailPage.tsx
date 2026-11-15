import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import type { Rfq } from '../types/api'
import { StatusBadge } from '../components/ui/Badge'
import { Countdown } from '../components/Countdown'
import { StandingsTable } from '../components/StandingsTable'
import { ActivityFeed } from '../components/ActivityFeed'
import { BidForm } from '../components/BidForm'
import { useAuctionPolling } from '../hooks/useAuctionPolling'
import { useAuth } from '../hooks/useAuth'

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass rounded-2xl p-4">
      <p className="text-[10px] uppercase tracking-widest text-slate-700 mb-1 font-medium">{label}</p>
      <p className={`text-lg font-bold tabular ${accent ? 'text-grad-accent' : 'text-slate-200'}`}>{value}</p>
    </div>
  )
}

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [rfq, setRfq] = useState<Rfq | null>(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState<{ ok: boolean; msg: string } | null>(null)
  const [publishing, setPublishing] = useState(false)

  useEffect(() => {
    if (!id) return
    rfqApi.get(id).then(setRfq).finally(() => setLoading(false))
  }, [id])

  const { standings, events, serverNow } = useAuctionPolling(id!, rfq?.status ?? 'DRAFT')

  // Sync rfq changes from poll
  useEffect(() => {
    if (!id || !rfq || !['ACTIVE','SCHEDULED'].includes(rfq.status)) return
    const t = setInterval(() => rfqApi.get(id).then(setRfq), 3000)
    return () => clearInterval(t)
  }, [id, rfq?.status])

  const handlePublish = async () => {
    if (!id) return
    setPublishing(true)
    try {
      const r = await rfqApi.publish(id)
      setRfq(r)
      setNotice({ ok: true, msg: `Auction published — ${r.status}` })
    } catch (e: unknown) {
      const msg = (e as {response?:{data?:{error?:{message?:string}}}})?.response?.data?.error?.message ?? 'Failed to publish'
      setNotice({ ok: false, msg })
    } finally { setPublishing(false) }
  }

  if (loading) return (
    <div className="p-7 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-14 glass rounded-2xl animate-pulse" />)}
    </div>
  )

  if (!rfq) return (
    <div className="p-7 flex items-center gap-3 text-slate-500">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      Auction not found or access denied.
    </div>
  )

  const isBuyer = user?.role === 'BUYER'
  const isSupplier = user?.role === 'SUPPLIER'
  const myRow = isSupplier ? standings?.standings.find(s => s.is_self) : null
  const isFinal = new Date(rfq.current_close_at).getTime() >= new Date(rfq.forced_close_at).getTime()

  return (
    <div className="p-7 max-w-6xl animate-fade-up">
      {/* Banners */}
      {rfq.status === 'FORCE_CLOSED' && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl px-5 py-3 bg-red-500/[0.08] border border-red-500/20">
          <span className="text-red-400">⬛</span>
          <span className="text-sm text-red-300 font-medium">Hard stop reached — auction permanently closed</span>
        </div>
      )}
      {rfq.status === 'ACTIVE' && isFinal && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl px-5 py-3 bg-amber-500/[0.07] border border-amber-500/20">
          <span className="text-amber-400 text-sm">⚠</span>
          <span className="text-sm text-amber-300">Final window — no further extensions possible</span>
        </div>
      )}
      {notice && (
        <div className={`mb-4 flex items-center justify-between rounded-2xl px-5 py-3 text-sm border ${notice.ok ? 'bg-green-500/[0.07] border-green-500/20 text-green-300' : 'bg-red-500/[0.07] border-red-500/20 text-red-300'}`}>
          {notice.msg}
          <button onClick={() => setNotice(null)} className="opacity-50 hover:opacity-100 ml-4">×</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-6 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <StatusBadge status={rfq.status} />
            <span className="text-xs text-slate-700 font-mono">{rfq.reference_id}</span>
            <span className="text-xs text-slate-700">{rfq.currency}</span>
            <span className="text-xs text-slate-700">· Service {rfq.service_date}</span>
            {rfq.version > 0 && <span className="text-[10px] text-slate-800 font-mono">v{rfq.version}</span>}
          </div>
          <h1 className="text-2xl font-bold text-grad tracking-tight">{rfq.name}</h1>
          <div className="flex gap-5 mt-2 text-xs text-slate-700">
            <span>Close: <span className="text-slate-500">{new Date(rfq.current_close_at).toLocaleString()}</span></span>
            <span>Hard stop: <span className="text-slate-500">{new Date(rfq.forced_close_at).toLocaleString()}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {rfq.status === 'DRAFT' && isBuyer && (
            <button onClick={handlePublish} disabled={publishing}
              className="btn-primary flex items-center gap-2">
              {publishing ? '…' : <>Publish Auction <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg></>}
            </button>
          )}
          {rfq.status === 'ACTIVE' && (
            <div className="glass rounded-2xl px-5 py-3 text-right">
              <p className="text-[10px] uppercase tracking-widest text-slate-700 mb-1">Closes in</p>
              <Countdown targetDate={rfq.current_close_at} urgent serverNow={serverNow} />
            </div>
          )}
        </div>
      </div>

      {/* Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Tile label="Current L1" value={standings?.current_l1_total ? `${rfq.currency} ${standings.current_l1_total}` : 'No bids'} accent={!!standings?.current_l1_total} />
        <Tile label="Suppliers" value={String(rfq.participating_supplier_count)} />
        <Tile label="Accepted Bids" value={String(rfq.accepted_bid_count)} />
        <Tile label="Extensions" value={String(rfq.extension_count)} />
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Standings */}
          <div className="glass rounded-3xl p-5">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
              Live Standings
            </h2>
            <StandingsTable standings={standings?.standings ?? []} currency={rfq.currency} isBuyer={isBuyer} />
          </div>

          {/* Bid form */}
          {isSupplier && (
            <div className="glass rounded-3xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                Submit Bid
              </h2>
              <BidForm
                rfqId={rfq.id} currency={rfq.currency} status={rfq.status}
                previousTotal={myRow?.total_amount ?? null}
                serviceDate={rfq.service_date}
                onSuccess={msg => setNotice({ ok: true, msg })}
                onError={msg => setNotice({ ok: false, msg })}
              />
            </div>
          )}

          {/* Config */}
          {rfq.auction_config && (
            <div className="glass rounded-3xl p-5">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4">Auction Rules</h2>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[10px] text-slate-700 mb-1 uppercase tracking-wide">Window X</p>
                  <p className="font-semibold text-slate-300">{rfq.auction_config.trigger_window_minutes}m</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-700 mb-1 uppercase tracking-wide">Extension Y</p>
                  <p className="font-semibold text-slate-300">{rfq.auction_config.extension_duration_minutes}m</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-700 mb-1 uppercase tracking-wide">Triggers</p>
                  <div className="flex flex-wrap gap-1">
                    {rfq.auction_config.triggers.map(t => (
                      <span key={t} className="text-[10px] bg-accent/10 text-accent-light border border-accent/20 rounded px-1.5 py-0.5">
                        {t === 'BID_RECEIVED' ? 'Bid' : t === 'ANY_RANK_CHANGE' ? 'Rank' : 'L1'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="glass rounded-3xl p-5 h-fit sticky top-6">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Activity
          </h2>
          <ActivityFeed events={events} />
        </div>
      </div>
    </div>
  )
}
