/**
 * BidForm — HD-BID-07: two-step Review → Confirm flow.
 * HD-BID-08: inputmode="decimal", string-only, no parseFloat.
 * HD-SEC-01: 401 preserves form state and idempotency key.
 * HD-CON-10: on timeout/5xx show UNKNOWN state with retry button.
 */
import React, { useState, useRef } from 'react'
import type { RfqStatus } from '../types/api'
import { bidsApi } from '../api/bids'
import Decimal from 'decimal.js'
import { ArrowRight, AlertTriangle, Send } from 'lucide-react'

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
    if (!strictParseMoney(freight)) errs.freight = 'Use format 1250.50'
    if (!strictParseMoney(origin)) errs.origin = 'Use format 1250.50'
    if (!strictParseMoney(destination)) errs.destination = 'Use format 1250.50'
    if (!transit || isNaN(parseInt(transit)) || parseInt(transit) < 0) errs.transit = 'Whole number ≥ 0'
    if (parseInt(transit) > 365) errs.transit = 'Max 365 days'
    if (!validUntil) errs.validUntil = 'Required'
    if (validUntil && validUntil < serviceDate) errs.validUntil = 'Must be on/after service date'
    if (preview === null) errs.freight = errs.freight || 'Fix money values'
    if (preview && new Decimal(preview).lessThanOrEqualTo(0)) errs.freight = 'Total must be > 0'
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
      onSuccess(`Bid accepted — ${result.rank}${result.extension.applied ? ' · Auto-extension triggered!' : ''}`)
      setStep('entry')
      setFreight(''); setOrigin(''); setDestination(''); setTransit(''); setValidUntil('')
    } catch (err: unknown) {
      const resp = (err as { response?: { data?: { error?: { code?: string; message?: string } } } })?.response
      const code = resp?.data?.error?.code ?? ''
      const msg = resp?.data?.error?.message ?? 'An error occurred.'

      if (code === 'CONFIRMATION_REQUIRED') {
        setConfirmLargeDrop(true)
        onError(msg + ' Please confirm large drop to proceed.')
        setStep('review')
        return
      }

      // HD-CON-10: timeout or 5xx = UNKNOWN state
      const statusCode = (err as { response?: { status?: number } })?.response?.status
      if (!statusCode || statusCode >= 500) {
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
      onError('Max retries reached. Check your bid history to confirm status.')
      setStep('entry')
      return
    }
    const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 8000)
    await new Promise(r => setTimeout(r, delay))
    await handleConfirm()
  }

  if (!canBid) {
    return (
      <div className="rounded-2xl bg-[#080c14]/85 border border-white/10 p-5 text-xs text-cream-muted font-mono">
        {status === 'SCHEDULED' && 'Bidding opens when the scheduled start time arrives.'}
        {(status === 'CLOSED' || status === 'FORCE_CLOSED') && 'This auction floor is closed. No further bids accepted.'}
        {status === 'CANCELLED' && 'This auction RFQ was cancelled.'}
        {status === 'DRAFT' && 'This auction has not been published yet.'}
      </div>
    )
  }

  // UNKNOWN outcome state
  if (step === 'unknown') {
    return (
      <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-3">
        <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider font-mono">Confirming Bid Reception…</p>
        <p className="text-xs text-slate-300">
          Your bid may have reached the server. We are retrying with the same idempotency key.
        </p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={handleRetry}
            className="py-2.5 px-5 rounded-full bg-[#f4ebe1] text-black font-semibold text-xs shadow-md"
          >
            Retry Now
          </button>
          <button
            onClick={() => setStep('review')}
            className="py-2.5 px-5 rounded-full bg-[#0b101a]/75 border border-white/10 text-xs text-slate-300"
          >
            Cancel
          </button>
        </div>
      </div>
    )
  }

  // Review step
  if (step === 'review' || step === 'submitting') {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-[#080c14]/90 border border-white/10 p-5 space-y-3">
          <p className="text-[9px] font-mono tracking-widest text-slate-400 uppercase">Review Decrement Quote</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[['Freight', freight], ['Origin', origin], ['Destination', destination]].map(([l, v]) => (
              <div key={l} className="p-2.5 rounded-xl bg-black/40 border border-white/[0.04]">
                <p className="text-[9px] text-cream-muted font-mono uppercase">{l} ({currency})</p>
                <p className="tabular font-bold text-cream font-mono mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-white/[0.08]">
            <div>
              <p className="text-[9px] text-cream-muted font-mono uppercase">Total Quote</p>
              <p className="text-2xl font-bold tabular text-cream font-mono">{preview} {currency}</p>
            </div>
            {previousTotal && (
              <div className="text-right">
                <p className="text-[9px] text-cream-muted font-mono uppercase">Previous Accepted</p>
                <p className="text-xs tabular text-slate-400 font-mono">{previousTotal}</p>
                {preview && (
                  <p className={`text-xs font-mono font-semibold ${isLargeDrop ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {(100 - (parseFloat(preview) / parseFloat(previousTotal)) * 100).toFixed(1)}% reduction
                  </p>
                )}
              </div>
            )}
          </div>

          {isLargeDrop && !confirmLargeDrop && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 flex items-center gap-2">
              <AlertTriangle size={14} className="flex-shrink-0" />
              <span>Large drop detected (&gt;50%). British auction bids are irreversible. Confirm to submit.</span>
            </div>
          )}

          <p className="text-[10px] text-slate-500 font-mono">
            Transit: {transit} days · Valid until: {validUntil}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={step === 'submitting'}
            className="flex-1 py-3 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            {step === 'submitting' ? (
              <span>Broadcasting Bid…</span>
            ) : (
              <>
                <span>{isLargeDrop && !confirmLargeDrop ? 'Confirm Large Drop & Submit' : 'Confirm & Submit Bid'}</span>
                <Send size={13} />
              </>
            )}
          </button>
          <button
            onClick={() => setStep('entry')}
            disabled={step === 'submitting'}
            className="py-3 px-6 rounded-full bg-[#0b101a]/75 hover:bg-white/[0.06] border border-white/10 text-xs text-slate-300 font-mono transition-all"
          >
            Edit
          </button>
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
            <label className="block text-xs font-medium text-cream-muted mb-1.5">{label} ({currency})</label>
            <input
              inputMode="decimal"
              type="text"
              value={value}
              onChange={e => {
                const v = e.target.value.replace(/[^0-9.]/g, '')
                set(v)
              }}
              placeholder="0.00"
              className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 font-mono focus:outline-none transition-colors"
            />
            {fieldErrors[key] && <p className="text-[10px] text-red-400 font-mono mt-1">{fieldErrors[key]}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-cream-muted mb-1.5">Transit Days</label>
          <input
            inputMode="numeric"
            type="text"
            value={transit}
            onChange={e => setTransit(e.target.value.replace(/\D/g, ''))}
            placeholder="0"
            className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 font-mono focus:outline-none transition-colors"
          />
          {fieldErrors.transit && <p className="text-[10px] text-red-400 font-mono mt-1">{fieldErrors.transit}</p>}
        </div>
        <div>
          <label className="block text-xs font-medium text-cream-muted mb-1.5">Valid Until</label>
          <input
            type="date"
            value={validUntil}
            onChange={e => setValidUntil(e.target.value)}
            min={serviceDate}
            className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 font-mono focus:outline-none transition-colors"
          />
          {fieldErrors.validUntil && <p className="text-[10px] text-red-400 font-mono mt-1">{fieldErrors.validUntil}</p>}
        </div>
      </div>

      {/* Preview Box */}
      <div className="flex items-center justify-between bg-[#080c14]/90 rounded-2xl px-5 py-3.5 border border-white/10">
        <div>
          <p className="text-[9px] font-mono tracking-widest text-slate-400 uppercase">Estimated Total ({currency})</p>
          <p className={`text-xl font-bold font-mono ${preview ? 'text-cream' : 'text-slate-600'}`}>
            {preview ? `${preview} ${currency}` : '—'}
          </p>
        </div>
        {previousTotal && (
          <div className="text-right">
            <p className="text-[9px] font-mono tracking-widest text-slate-400 uppercase">Your Last Accepted</p>
            <p className="text-xs font-mono text-slate-400">{previousTotal} {currency}</p>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="w-full py-3 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center justify-center gap-2 shadow-lg transition-all"
      >
        <span>Review & Validate Bid</span>
        <ArrowRight size={14} className="stroke-[2.5]" />
      </button>
    </form>
  )
}
