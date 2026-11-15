"use client"

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
import { Activity, Shield, Clock, Send, AlertTriangle, ArrowLeft } from 'lucide-react'

function AppleTile({ label, value, subtext, accent }: { label: string; value: string; subtext?: string; accent?: boolean }) {
  return (
    <div className="rounded-[24px] p-5 bg-[#0d121c]/88 border border-white/[0.08] shadow-[0_15px_35px_rgba(0,0,0,0.6)] backdrop-blur-2xl">
      <p className="text-[9px] font-mono tracking-widest uppercase text-slate-400 mb-1.5">{label}</p>
      <p className={`text-xl md:text-2xl font-bold font-mono tracking-tight ${accent ? 'text-emerald-400' : 'text-cream'}`}>{value}</p>
      {subtext && <p className="text-[10px] text-slate-500 mt-1 font-mono">{subtext}</p>}
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
    if (!id || !rfq || !['ACTIVE', 'SCHEDULED'].includes(rfq.status)) return
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
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to publish'
      setNotice({ ok: false, msg })
    } finally { setPublishing(false) }
  }

  if (loading) return (
    <div className="p-4 md:p-8 space-y-4 max-w-6xl mx-auto">
      {[1, 2, 3].map(i => <div key={i} className="h-20 rounded-[28px] bg-[#0d121c]/60 border border-white/[0.06] animate-pulse" />)}
    </div>
  )

  if (!rfq) return (
    <div className="p-8 max-w-xl mx-auto text-center rounded-[30px] p-8 border border-white/[0.08] bg-[#0d121c]/88 shadow-2xl mt-12 space-y-4">
      <p className="text-cream text-lg font-bold uppercase tracking-tight">Auction Floor Not Found</p>
      <p className="text-xs text-cream-muted">The auction might have concluded or your credentials lack permission for this room.</p>
      <button
        onClick={() => navigate('/auctions')}
        className="py-2.5 px-5 rounded-full bg-[#f4ebe1] text-black font-semibold text-xs tracking-wide shadow-md"
      >
        Return to Floor
      </button>
    </div>
  )

  const isBuyer = user?.role === 'BUYER'
  const isSupplier = user?.role === 'SUPPLIER'
  const myRow = isSupplier ? standings?.standings.find(s => s.is_self) : null
  const isFinal = new Date(rfq.current_close_at).getTime() >= new Date(rfq.forced_close_at).getTime()

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6 animate-fade-up">
      {/* Back button */}
      <div>
        <button
          onClick={() => navigate('/auctions')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cream transition-colors font-mono"
        >
          <ArrowLeft size={13} />
          <span>Back to Auctions</span>
        </button>
      </div>

      {/* Critical Protocol Alerts */}
      {rfq.status === 'FORCE_CLOSED' && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5 bg-red-500/[0.1] border border-red-500/20 text-red-200">
          <span className="text-red-400 font-bold">■</span>
          <span className="text-xs md:text-sm font-medium">Postgres database clock hard stop reached — auction permanently closed per British Auction protocol.</span>
        </div>
      )}
      {rfq.status === 'ACTIVE' && isFinal && (
        <div className="flex items-center gap-3 rounded-2xl px-5 py-3.5 bg-amber-500/[0.1] border border-amber-500/20 text-amber-200">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
          <span className="text-xs md:text-sm font-medium">Final extension window — no further extensions permitted beyond forced close ceiling.</span>
        </div>
      )}
      {notice && (
        <div className={`flex items-center justify-between rounded-2xl px-5 py-3.5 text-xs md:text-sm border ${
          notice.ok ? 'bg-emerald-500/[0.1] border-emerald-500/20 text-emerald-200' : 'bg-red-500/[0.1] border-red-500/20 text-red-200'
        }`}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} className="opacity-60 hover:opacity-100 text-sm">✕</button>
        </div>
      )}

      {/* Header Card: Apple Luxury Layout */}
      <div className="rounded-[30px] p-6 md:p-8 border border-white/[0.09] shadow-[0_25px_60px_rgba(0,0,0,0.8)] bg-[#0d121c]/88 backdrop-blur-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div>
          {/* macOS window traffic lights */}
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
            <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase ml-2">
              LIVE RFQ ROOM · {rfq.reference_id}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 mb-2.5">
            <StatusBadge status={rfq.status} />
            <span className="text-xs text-cream-muted font-mono bg-white/[0.04] px-2.5 py-0.5 rounded-full border border-white/[0.06]">
              {rfq.currency}
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-xs text-cream-muted">Service Date: {rfq.service_date}</span>
            {rfq.version > 0 && (
              <span className="text-[10px] text-cream-muted font-mono bg-white/[0.05] px-2 py-0.5 rounded-full">
                v{rfq.version}
              </span>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-cream uppercase">{rfq.name}</h1>
          <div className="flex flex-wrap gap-4 mt-2 text-xs text-cream-muted font-mono">
            <span>Bid Close: <span className="text-cream">{new Date(rfq.current_close_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></span>
            <span className="text-slate-600">|</span>
            <span>Hard Stop (Forced): <span className="text-cream">{new Date(rfq.forced_close_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></span>
          </div>
        </div>

        <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end">
          {rfq.status === 'DRAFT' && isBuyer && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              className="py-3 px-6 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center gap-2 shadow-lg transition-all"
            >
              {publishing ? 'Publishing Floor…' : 'Publish Live Auction'}
            </button>
          )}

          {rfq.status === 'ACTIVE' && (
            <div className="rounded-2xl p-4 text-right border border-emerald-500/30 bg-[#080c14]/90 shadow-[0_0_25px_rgba(16,185,129,0.15)] min-w-[130px]">
              <p className="text-[9px] font-mono tracking-widest uppercase text-cream-muted mb-1">Closes In</p>
              <Countdown targetDate={rfq.current_close_at} urgent serverNow={serverNow} />
            </div>
          )}
        </div>
      </div>

      {/* Metric Tiles Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <AppleTile
          label="Current Lowest (L1)"
          value={standings?.current_l1_total ? `${rfq.currency} ${Number(standings.current_l1_total).toLocaleString()}` : 'Awaiting Bids'}
          subtext={standings?.current_l1_total ? 'Leading quote' : undefined}
          accent={!!standings?.current_l1_total}
        />
        <AppleTile label="Invited Cohort" value={String(rfq.participating_supplier_count)} subtext="Participating suppliers" />
        <AppleTile label="Accepted Bids" value={String(rfq.accepted_bid_count)} subtext="Validated submissions" />
        <AppleTile label="Extensions" value={String(rfq.extension_count)} subtext={`Trigger window: ${rfq.auction_config?.trigger_window_minutes || 2}m`} />
      </div>

      {/* Main Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Live Standings Card */}
          <div className="rounded-[28px] p-6 md:p-7 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.7)] bg-[#0d121c]/88 backdrop-blur-2xl">
            <h2 className="text-xs font-semibold text-cream uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
              <Activity size={14} className="text-emerald-400" />
              <span>Current Auction Floor Standings</span>
            </h2>
            <StandingsTable standings={standings?.standings ?? []} currency={rfq.currency} isBuyer={isBuyer} />
          </div>

          {/* Supplier Bid Submission Form */}
          {isSupplier && (
            <div className="rounded-[28px] p-6 md:p-7 border border-emerald-500/25 shadow-[0_20px_50px_rgba(0,0,0,0.7)] bg-[#0d121c]/88 backdrop-blur-2xl">
              <h2 className="text-xs font-semibold text-cream uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
                <Send size={14} className="text-emerald-400" />
                <span>Submit Decrement Bid</span>
              </h2>
              <BidForm
                rfqId={rfq.id}
                currency={rfq.currency}
                status={rfq.status}
                previousTotal={myRow?.total_amount ?? null}
                serviceDate={rfq.service_date}
                onSuccess={msg => setNotice({ ok: true, msg })}
                onError={msg => setNotice({ ok: false, msg })}
              />
            </div>
          )}

          {/* British Reverse Auction Rules */}
          {rfq.auction_config && (
            <div className="rounded-[28px] p-6 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.7)] bg-[#0d121c]/88 backdrop-blur-2xl">
              <h2 className="text-xs font-semibold text-cream uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
                <Shield size={14} className="text-blue-400" />
                <span>British Reverse Protocol Parameters</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3.5 rounded-2xl bg-[#080c14]/80 border border-white/10">
                  <p className="text-[9px] text-cream-muted font-mono uppercase mb-1">Trigger Window (X)</p>
                  <p className="font-semibold text-cream font-mono">{rfq.auction_config.trigger_window_minutes} minutes before close</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#080c14]/80 border border-white/10">
                  <p className="text-[9px] text-cream-muted font-mono uppercase mb-1">Extension Duration (Y)</p>
                  <p className="font-semibold text-cream font-mono">+{rfq.auction_config.extension_duration_minutes} minutes added</p>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#080c14]/80 border border-white/10">
                  <p className="text-[9px] text-cream-muted font-mono uppercase mb-1">Active Triggers</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {rfq.auction_config.triggers.map(t => (
                      <span key={t} className="text-[9px] bg-white/[0.06] text-cream border border-white/10 rounded px-1.5 py-0.5 font-mono">
                        {t === 'BID_RECEIVED' ? 'Any Bid' : t === 'ANY_RANK_CHANGE' ? 'Rank Change' : 'L1 Change'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Real-Time Activity Feed Column */}
        <div className="space-y-6">
          <div className="rounded-[28px] p-6 border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.7)] bg-[#0d121c]/88 backdrop-blur-2xl sticky top-6">
            <h2 className="text-xs font-semibold text-cream uppercase tracking-wider mb-4 flex items-center gap-2 font-mono">
              <Clock size={14} className="text-cream" />
              <span>Real-Time Activity Feed</span>
            </h2>
            <ActivityFeed events={events} />
          </div>
        </div>
      </div>
    </div>
  )
}
