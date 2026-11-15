/**
 * BidForm — HD-BID-07: two-step Review → Confirm flow.
 * HD-BID-08: inputmode="decimal", string-only, no parseFloat.
 * HD-SEC-01: 401 preserves form state and idempotency key.
 * HD-CON-10: on timeout/5xx show UNKNOWN state with retry button.
 */
import React, { useState, useRef } from 'react'
import { Button } from './ui/Button'
import type { RfqStatus } from '../types/api'
import { bidsApi } from '../api/bids'
import Decimal from 'decimal.js'

function genKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function strictParseMoney(v: string): Decimal | null {
  if (!/^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/.test(v)) return null
  try { return new Decimal(v) } catch { return null }
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

type Step = 'entry' | 'review' | 'submitting' | 'unknown'

export function BidForm({ rfqId, currency, status, previousTotal, serviceDate, onSuccess, onError }: BidFormProps) {
  const [freight, setFreight] = useState('')
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [transit, setTransit] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [step, setStep] = useState<Step>('entry')
  const [confirmLargeDrop, setConfirmLargeDrop] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  // HD-CON-09: generate key on Review; reuse for all retries of same payload
  const idempKeyRef = useRef<string>(genKey())
  const retryCountRef = useRef(0)

  const canBid = status === 'ACTIVE'

  // Preview total — display only, never sent as authoritative value
  const preview = (() => {
    const f = strictParseMoney(freight)
    const o = strictParseMoney(origin)
    const d = strictParseMoney(destination)
    if (!f || !o || !d) return null
    return f.plus(o).plus(d).toFixed(2)
  })()

  const isLargeDrop = (() => {
    if (!previousTotal || !preview) return false
    try {
      const prev = new Decimal(previousTotal)
      const next = new Decimal(preview)
      return next.lessThan(prev.times(0.5))
    } catch { return false }
  })()

  function validateEntry(): boolean {
    const errs: Record<string, string> = {}
    if (!strictParseMoney(freight)) errs.freight = 'Use format 1250.50 — no commas or exponents'
    if (!strictParseMoney(origin)) errs.origin = 'Use format 1250.50'
    if (!strictParseMoney(destination)) errs.destination = 'Use format 1250.50'
    if (!transit || isNaN(parseInt(transit)) || parseInt(transit) < 0) errs.transit = 'Enter a whole number ≥ 0'
    if (parseInt(transit) > 365) errs.transit = 'Max 365 days'
    if (!validUntil) errs.validUntil = 'Required'
    if (validUntil && validUntil < serviceDate) errs.validUntil = 'Must be on or after service date'
    if (preview === null) errs.freight = errs.freight || 'Fix money values'
    if (preview && new Decimal(preview).lessThanOrEqualTo(0)) errs.freight = 'Total must be greater than zero'
    setFieldErrors(errs)
    return Object.keys(errs).length === 0
  }

  function handleReview(e: React.FormEvent) {
    e.preventDefault()
    if (!validateEntry()) return
    // New review step = new idempotency key (HD-BID-07)
    idempKeyRef.current = genKey()
    retryCountRef.current = 0
    setStep('review')
  }

  async function handleConfirm() {
    setStep('submitting')
    try {
      const result = await bidsApi.submit(
        rfqId,
        {
          freight_charge: freight,
          origin_charge: origin,
          destination_charge: destination,
          transit_time_days: parseInt(transit),
          valid_until: validUntil,
          confirm_large_drop: confirmLargeDrop,
        },
        idempKeyRef.current
      )
      onSuccess(`Bid accepted — ${result.rank}${result.extension.applied ? ' · Auction extended!' : ''}`)
      setStep('entry')
      setFreight(''); setOrigin(''); setDestination(''); setTransit(''); setValidUntil('')
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response
      const code = resp?.data?.error?.code ?? ''
      const msg = resp?.data?.error?.message ?? 'An error occurred.'

      if (code === 'CONFIRMATION_REQUIRED') {
        setConfirmLargeDrop(true)
        onError(msg + ' Re-confirm to proceed.')
        setStep('review')
        return
      }

      // HD-CON-10: timeout or 5xx = UNKNOWN state
      const status = (err as { response?: { status?: number } })?.response?.status
      if (!status || status >= 500) {
        setStep('unknown')
        return
      }

      onError(msg)
      setStep('review')
    }
  }

  async function handleRetry() {
    retryCountRef.current++
    if (retryCountRef.current > 4) {
      // Max retries — look up via idempotency key
      onError('Max retries reached. Check your bid history to confirm status.')
      setStep('entry')
      return
    }
    // Exponential backoff: 1, 2, 4, 8s
    const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 8000)
    await new Promise(r => setTimeout(r, delay))
    await handleConfirm()
  }

  if (!canBid) {
    return (
      <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-4 py-3 text-sm text-slate-400">
        {status === 'SCHEDULED' && 'Bidding opens when the auction starts.'}
        {(status === 'CLOSED' || status === 'FORCE_CLOSED') && 'This auction is closed. No new bids accepted.'}
        {status === 'CANCELLED' && 'This auction was cancelled.'}
        {status === 'DRAFT' && 'This auction has not been published yet.'}
      </div>
    )
  }

  // UNKNOWN outcome state
  if (step === 'unknown') {
    return (
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-3">
        <p className="text-sm font-medium text-amber-300">Confirming your bid…</p>
        <p className="text-xs text-slate-400">
          Your bid may have been accepted. We're retrying with the same key.
        </p>
        <div className="flex gap-3">
          <Button variant="primary" onClick={handleRetry} size="sm">Retry</Button>
          <Button variant="ghost" onClick={() => setStep('review')} size="sm">Cancel</Button>
        </div>
      </div>
    )
  }

  // Review step
  if (step === 'review' || step === 'submitting') {
    return (
      <div className="space-y-4">
        <div className="rounded-xl bg-base-700/60 border border-white/[0.08] p-4 space-y-2">
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Review Your Bid</p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            {[['Freight', freight], ['Origin', origin], ['Destination', destination]].map(([l, v]) => (
              <div key={l}>
                <p className="text-xs text-slate-500">{l} ({currency})</p>
                <p className="tabular font-semibold text-slate-200">{v}</p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
            <div>
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-xl font-bold tabular text-white">{preview} {currency}</p>
            </div>
            {previousTotal && (
              <div className="text-right">
                <p className="text-xs text-slate-500">Previous</p>
                <p className="text-sm tabular text-slate-400">{previousTotal}</p>
                {preview && (
                  <p className={`text-xs ${isLargeDrop ? 'text-amber-400' : 'text-slate-500'}`}>
                    {preview && previousTotal
                      ? `${(100 - parseFloat(preview) / parseFloat(previousTotal) * 100).toFixed(1)}% drop`
                      : ''}
                  </p>
                )}
              </div>
            )}
          </div>
          {isLargeDrop && !confirmLargeDrop && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs text-amber-300">
              ⚠ This is a large drop (&gt;50%). Bids are immutable. Confirm to proceed.
            </div>
          )}
          <p className="text-xs text-slate-600">Transit: {transit} days · Valid until: {validUntil}</p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="primary"
            onClick={handleConfirm}
            loading={step === 'submitting'}
            size="lg"
            className="flex-1"
          >
            {isLargeDrop && !confirmLargeDrop ? 'Confirm Large Drop & Submit' : 'Confirm & Submit Bid'}
          </Button>
          <Button variant="secondary" onClick={() => setStep('entry')} disabled={step === 'submitting'}>
            Edit
          </Button>
        </div>
      </div>
    )
  }

  // Entry step
  return (
    <form onSubmit={handleReview} className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Freight', value: freight, set: setFreight, key: 'freight' },
          { label: 'Origin', value: origin, set: setOrigin, key: 'origin' },
          { label: 'Destination', value: destination, set: setDestination, key: 'destination' },
        ].map(({ label, value, set, key }) => (
          <div key={key}>
            <label className="block text-xs text-slate-500 mb-1.5">{label} ({currency})</label>
            {/* HD-BID-08: inputmode=decimal, string only */}
            <input
              inputMode="decimal"
              type="text"
              value={value}
              onChange={e => {
                // Strip anything that isn't digits or a single dot
                const v = e.target.value.replace(/[^0-9.]/g, '')
                set(v)
              }}
              placeholder="0.00"
              className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 tabular placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
            />
            {fieldErrors[key] && <p className="text-xs text-red-400 mt-1">{fieldErrors[key]}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Transit Days</label>
          <input
            inputMode="numeric"
            type="text"
            value={transit}
            onChange={e => setTransit(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
          />
          {fieldErrors.transit && <p className="text-xs text-red-400 mt-1">{fieldErrors.transit}</p>}
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1.5">Valid Until</label>
          <input
            type="date"
            value={validUntil}
            onChange={e => setValidUntil(e.target.value)}
            min={serviceDate}
            className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
          />
          {fieldErrors.validUntil && <p className="text-xs text-red-400 mt-1">{fieldErrors.validUntil}</p>}
        </div>
      </div>

      {/* Preview */}
      <div className="flex items-center justify-between bg-base-700/60 rounded-lg px-4 py-3 border border-white/[0.06]">
        <div>
          <p className="text-xs text-slate-500">Preview Total ({currency})</p>
          <p className={`text-xl font-semibold tabular ${preview ? 'text-slate-200' : 'text-slate-600'}`}>
            {preview ?? '—'}
          </p>
        </div>
        {previousTotal && (
          <div className="text-right">
            <p className="text-xs text-slate-500">Your Last Accepted</p>
            <p className="text-sm tabular text-slate-400">{previousTotal}</p>
          </div>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full">
        Review Bid
      </Button>
    </form>
  )
}
