import React, { useState } from 'react'
import { Button } from './ui/Button'
import type { RfqStatus } from '../types/api'
import { bidsApi } from '../api/bids'
import Decimal from 'decimal.js'

// Simple uuid fallback using crypto
function genKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

interface BidFormProps {
  rfqId: string
  currency: string
  status: RfqStatus
  previousTotal: string | null
  serviceDate: string
  onSuccess: (msg: string) => void
  onError: (msg: string) => void
}

export function BidForm({ rfqId, currency, status, previousTotal, serviceDate, onSuccess, onError }: BidFormProps) {
  const [freight, setFreight] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [transit, setTransit] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [loading, setLoading] = useState(false)
  const [idempKey] = useState(() => genKey())

  const canBid = status === 'ACTIVE'

  const preview = (() => {
    try {
      const f = new Decimal(freight || '0')
      const o = new Decimal(origin || '0')
      const d = new Decimal(destination || '0')
      return f.plus(o).plus(d).toFixed(2)
    } catch {
      return '—'
    }
  })()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canBid) return
    setLoading(true)
    try {
      const result = await bidsApi.submit(
        rfqId,
        {
          freight_charge: freight,
          origin_charge: origin,
          destination_charge: destination,
          transit_time_days: parseInt(transit),
          valid_until: validUntil,
        },
        genKey() // new key each submit attempt
      )
      onSuccess(`Bid accepted! You are ${result.rank}${result.extension.applied ? ' — Auction extended!' : ''}`)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Bid rejected. Please check your values.'
      onError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!canBid && (
        <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-3 text-sm text-slate-400">
          {status === 'SCHEDULED' && 'Bidding opens when the auction starts.'}
          {status === 'CLOSED' && 'This auction is closed. No new bids accepted.'}
          {status === 'FORCE_CLOSED' && 'Forced close reached. No new bids accepted.'}
          {status === 'CANCELLED' && 'This auction was cancelled.'}
          {status === 'DRAFT' && 'This auction has not been published yet.'}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Freight', value: freight, set: setFreight },
          { label: 'Origin', value: origin, set: setOrigin },
          { label: 'Destination', value: destination, set: setDestination },
        ].map(({ label, value, set }) => (
          <div key={label}>
            <label className="block text-xs text-slate-500 mb-1.5">{label} ({currency})</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={value}
              onChange={e => set(e.target.value)}
              disabled={!canBid}
              placeholder="0.00"
              className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 tabular placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 disabled:opacity-40"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Transit Days</label>
          <input
            type="number"
            min="0"
            step="1"
            value={transit}
            onChange={e => setTransit(e.target.value)}
            disabled={!canBid}
            placeholder="0"
            className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 disabled:opacity-40"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Valid Until</label>
          <input
            type="date"
            value={validUntil}
            onChange={e => setValidUntil(e.target.value)}
            min={serviceDate}
            disabled={!canBid}
            className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 disabled:opacity-40"
          />
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center justify-between bg-base-700/60 rounded-lg px-4 py-3 border border-white/[0.06]">
        <div>
          <p className="text-xs text-slate-500">Preview Total ({currency})</p>
          <p className="text-xl font-semibold tabular text-slate-200">{preview}</p>
        </div>
        {previousTotal && (
          <div className="text-right">
            <p className="text-xs text-slate-500">Previous Accepted</p>
            <p className="text-sm tabular text-slate-400">{previousTotal}</p>
          </div>
        )}
      </div>

      <Button type="submit" disabled={!canBid} loading={loading} className="w-full" size="lg">
        Submit Bid
      </Button>
    </form>
  )
}
