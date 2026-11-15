import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import { suppliersApi, type SupplierItem } from '../api/suppliers'
import { Check, ChevronRight, Shield, Clock, Users, FileText, ArrowLeft } from 'lucide-react'

export default function CreateRfqPage() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<SupplierItem[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    name: '', reference_id: '', currency: 'USD', service_date: '',
    start_at: '', scheduled_close_at: '', forced_close_at: '',
    supplier_ids: [] as string[],
    trigger_window_minutes: '10', extension_duration_minutes: '5',
    triggers: ['BID_RECEIVED'] as string[],
  })

  useEffect(() => {
    suppliersApi.list().then(setSuppliers).catch(console.error)
  }, [])

  const set = (k: string, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { const n = { ...e }; delete n[k]; return n })
  }

  const toggleTrigger = (t: string) =>
    set('triggers', form.triggers.includes(t) ? form.triggers.filter(x => x !== t) : [...form.triggers, t])

  const toggleSupplier = (id: string) =>
    set('supplier_ids', form.supplier_ids.includes(id) ? form.supplier_ids.filter(x => x !== id) : [...form.supplier_ids, id])

  function validate1() {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.reference_id.trim()) e.reference_id = 'Required'
    if (!form.service_date) e.service_date = 'Required'
    setErrors(e); return !Object.keys(e).length
  }

  function validate2() {
    const e: Record<string, string> = {}
    if (!form.start_at) e.start_at = 'Required'
    if (!form.scheduled_close_at) e.scheduled_close_at = 'Required'
    if (!form.forced_close_at) e.forced_close_at = 'Required'
    if (form.start_at && form.scheduled_close_at && new Date(form.start_at) >= new Date(form.scheduled_close_at))
      e.start_at = 'Must be before scheduled close'
    if (form.scheduled_close_at && form.forced_close_at && new Date(form.scheduled_close_at) >= new Date(form.forced_close_at))
      e.forced_close_at = 'Must be strictly after scheduled close'
    setErrors(e); return !Object.keys(e).length
  }

  function validate3() {
    const e: Record<string, string> = {}
    if (suppliers.length > 0 && form.supplier_ids.length === 0)
      e.supplier_ids = 'Select at least one supplier'
    setErrors(e); return !Object.keys(e).length
  }

  function validate4() {
    const e: Record<string, string> = {}
    if (parseInt(form.trigger_window_minutes) < 1) e.trigger_window_minutes = 'Minimum 1 minute'
    if (parseInt(form.extension_duration_minutes) < 1) e.extension_duration_minutes = 'Minimum 1 minute'
    if (!form.triggers.length) e.triggers = 'Select at least one trigger'
    setErrors(e); return !Object.keys(e).length
  }

  function nextStep() {
    if (step === 1 && !validate1()) return
    if (step === 2 && !validate2()) return
    if (step === 3 && !validate3()) return
    setStep(s => s + 1)
  }

  async function handleCreate() {
    if (!validate4()) return
    setLoading(true)
    try {
      const payload = {
        name: form.name.trim(),
        reference_id: form.reference_id.trim(),
        currency: form.currency.toUpperCase(),
        service_date: form.service_date,
        start_at: new Date(form.start_at).toISOString(),
        scheduled_close_at: new Date(form.scheduled_close_at).toISOString(),
        forced_close_at: new Date(form.forced_close_at).toISOString(),
        supplier_ids: form.supplier_ids,
        auction_config: {
          trigger_window_minutes: parseInt(form.trigger_window_minutes) || 10,
          extension_duration_minutes: parseInt(form.extension_duration_minutes) || 5,
          triggers: form.triggers,
        },
      }
      const r = await rfqApi.create(payload)
      navigate(`/auctions/${r.id}`)
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to create auction'
      setErrors({ global: msg })
    } finally { setLoading(false) }
  }

  const steps = [
    { num: 1, label: 'RFQ Details', icon: <FileText size={13} /> },
    { num: 2, label: 'Timeline & Closes', icon: <Clock size={13} /> },
    { num: 3, label: 'Invite Cohort', icon: <Users size={13} /> },
    { num: 4, label: 'Extension Rules', icon: <Shield size={13} /> },
  ]

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-6 animate-fade-up">
      {/* Back link */}
      <div>
        <button
          onClick={() => navigate('/auctions')}
          className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-cream transition-colors font-mono"
        >
          <ArrowLeft size={13} />
          <span>Back to Auctions</span>
        </button>
      </div>

      {/* Header Card */}
      <div className="rounded-[30px] p-6 md:p-8 border border-white/[0.09] shadow-[0_25px_60px_rgba(0,0,0,0.8)] bg-[#0d121c]/88 backdrop-blur-2xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56] inline-block shadow-sm" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e] inline-block shadow-sm" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f] inline-block shadow-sm" />
          <span className="text-[9px] font-mono tracking-widest text-slate-500 uppercase ml-2">
            BRITISH AUCTION INITIALIZER
          </span>
        </div>

        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-cream uppercase">
          Create British Reverse RFQ
        </h1>
        <p className="text-xs text-cream-muted mt-1.5 font-normal">
          Configure an RFQ with auto-extension trigger parameters and an immutable Postgres hard-stop close.
        </p>

        {/* Progress Steps (Apple Capsule Bar) */}
        <div className="mt-6 p-2 rounded-2xl bg-[#080c14]/90 border border-white/10 flex items-center justify-between gap-1 overflow-x-auto">
          {steps.map(s => (
            <button
              key={s.num}
              onClick={() => s.num < step && setStep(s.num)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all flex-shrink-0 ${
                step === s.num
                  ? 'bg-[#f4ebe1] text-black font-semibold shadow-md'
                  : s.num < step
                  ? 'bg-[#0b101a]/70 border border-white/10 text-cream'
                  : 'text-slate-600 cursor-default'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === s.num ? 'bg-black text-[#f4ebe1]' : s.num < step ? 'bg-white/10 text-cream' : 'bg-white/5 text-slate-600'
                }`}
              >
                {s.num < step ? '✓' : s.num}
              </span>
              <span className="hidden sm:inline font-mono">{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      {errors.global && (
        <div className="rounded-2xl px-5 py-3.5 text-xs text-red-300 bg-red-500/10 border border-red-500/25">
          {errors.global}
        </div>
      )}

      {/* Step Form Card */}
      <div className="rounded-[30px] p-7 md:p-8 border border-white/[0.09] shadow-[0_25px_60px_rgba(0,0,0,0.85)] bg-[#0d121c]/88 backdrop-blur-2xl">
        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-cream uppercase tracking-wider font-mono">
              General RFQ Identification
            </h2>
            <Field
              label="Auction Name"
              value={form.name}
              onChange={v => set('name', v)}
              error={errors.name}
              placeholder="e.g. Q4 Trans-Pacific Freight RFQ"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Reference ID"
                value={form.reference_id}
                onChange={v => set('reference_id', v)}
                error={errors.reference_id}
                placeholder="e.g. RFQ-2026-008"
              />
              <div>
                <label className="block text-xs text-cream-muted mb-1.5 font-medium">Currency</label>
                <select
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                  className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 font-mono focus:outline-none transition-colors"
                >
                  <option value="USD">USD — US Dollar ($)</option>
                  <option value="EUR">EUR — Euro (€)</option>
                  <option value="GBP">GBP — British Pound (£)</option>
                  <option value="INR">INR — Indian Rupee (₹)</option>
                  <option value="SGD">SGD — Singapore Dollar ($)</option>
                </select>
              </div>
            </div>
            <Field
              label="Service / Fulfillment Date"
              type="date"
              value={form.service_date}
              onChange={v => set('service_date', v)}
              error={errors.service_date}
            />
          </div>
        )}

        {/* Step 2: Timeline */}
        {step === 2 && (
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-cream uppercase tracking-wider font-mono">
              Timeline & Anti-Sniping Hard Stop
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field
                label="Bid Start Time (UTC)"
                type="datetime-local"
                value={form.start_at}
                onChange={v => set('start_at', v)}
                error={errors.start_at}
              />
              <Field
                label="Scheduled Close (UTC)"
                type="datetime-local"
                value={form.scheduled_close_at}
                onChange={v => set('scheduled_close_at', v)}
                error={errors.scheduled_close_at}
              />
              <Field
                label="Forced Close / Hard Stop"
                type="datetime-local"
                value={form.forced_close_at}
                onChange={v => set('forced_close_at', v)}
                error={errors.forced_close_at}
              />
            </div>
            <div className="p-4 rounded-2xl bg-[#080c14]/80 border border-white/10 text-xs text-cream-muted space-y-1 font-mono">
              <p className="font-semibold text-cream">Hard Stop Invariant (SRS §3.8):</p>
              <p className="text-[11px] text-slate-400">
                The scheduled close dynamically pushes out when valid quotes arrive inside the trigger window, but extensions can NEVER exceed the forced close timestamp under any condition.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: Suppliers */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-cream uppercase tracking-wider font-mono">
                Select Invited Supplier Cohort
              </h2>
              <div className="flex items-center gap-3">
                {suppliers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => set('supplier_ids', form.supplier_ids.length === suppliers.length ? [] : suppliers.map(s => s.id))}
                    className="text-[10px] font-mono text-cream hover:underline uppercase tracking-wider"
                  >
                    {form.supplier_ids.length === suppliers.length ? 'Deselect All' : 'Select All'}
                  </button>
                )}
                <span className="text-xs text-cream-muted font-mono">{form.supplier_ids.length} selected</span>
              </div>
            </div>
            {suppliers.length === 0 ? (
              <div className="p-8 text-center text-cream-muted text-xs border border-white/10 rounded-2xl bg-[#080c14]/80 font-mono space-y-3">
                <p>No registered supplier accounts detected in system.</p>
                <button
                  type="button"
                  onClick={() => suppliersApi.list().then(setSuppliers).catch(console.error)}
                  className="py-1.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/10 text-cream text-xs border border-white/10"
                >
                  Refresh Suppliers
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {suppliers.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleSupplier(s.id)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                      form.supplier_ids.includes(s.id)
                        ? 'bg-[#f4ebe1]/15 border-[#f4ebe1]/40 text-cream shadow-inner'
                        : 'bg-[#080c14]/80 border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border flex-shrink-0 ${
                        form.supplier_ids.includes(s.id) ? 'bg-[#f4ebe1] border-[#f4ebe1] text-black' : 'border-white/20'
                      }`}
                    >
                      {form.supplier_ids.includes(s.id) && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span className="text-xs font-medium font-mono">{s.display_name}</span>
                  </button>
                ))}
              </div>
            )}
            {errors.supplier_ids && <p className="text-xs text-red-400 font-mono">{errors.supplier_ids}</p>}
          </div>
        )}

        {/* Step 4: Rules */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-xs font-semibold text-cream uppercase tracking-wider font-mono">
              British Reverse Auction Auto-Extension Rules
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field
                label="Trigger Window X (minutes before close)"
                type="number"
                value={form.trigger_window_minutes}
                onChange={v => set('trigger_window_minutes', v)}
                error={errors.trigger_window_minutes}
                placeholder="10"
              />
              <Field
                label="Extension Duration Y (minutes added)"
                type="number"
                value={form.extension_duration_minutes}
                onChange={v => set('extension_duration_minutes', v)}
                error={errors.extension_duration_minutes}
                placeholder="5"
              />
            </div>

            <div>
              <label className="block text-xs text-cream-muted mb-2 font-medium">Extension Triggers (OR Condition)</label>
              <div className="space-y-2">
                {[
                  { value: 'BID_RECEIVED', label: 'Any valid decrement bid arrives in final X minutes' },
                  { value: 'ANY_RANK_CHANGE', label: 'Any participating supplier rank position changes' },
                  { value: 'L1_CHANGE', label: 'The lowest leading quote (L1) is overtaken' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleTrigger(opt.value)}
                    className={`w-full flex items-start gap-3 p-3.5 rounded-2xl border text-left transition-all ${
                      form.triggers.includes(opt.value)
                        ? 'bg-[#f4ebe1]/15 border-[#f4ebe1]/40 text-cream shadow-inner'
                        : 'bg-[#080c14]/80 border-white/[0.08] text-slate-300 hover:text-white hover:bg-white/[0.05]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border flex-shrink-0 ${
                        form.triggers.includes(opt.value) ? 'bg-[#f4ebe1] border-[#f4ebe1] text-black' : 'border-white/20'
                      }`}
                    >
                      {form.triggers.includes(opt.value) && <Check size={12} strokeWidth={3} />}
                    </div>
                    <span className="text-xs font-mono">{opt.label}</span>
                  </button>
                ))}
              </div>
              {errors.triggers && <p className="text-xs text-red-400 font-mono mt-1">{errors.triggers}</p>}
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-mono p-3 rounded-2xl bg-[#080c14]/80 border border-white/10">
              When a qualifying bid occurs within the trigger window, the current close time extends by Y minutes, strictly bound by the forced close limit.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={() => (step > 1 ? setStep(s => s - 1) : navigate('/auctions'))}
            className="py-2.5 px-5 rounded-full bg-[#0b101a]/75 hover:bg-white/[0.06] border border-white/10 text-xs text-slate-300 font-mono transition-all"
          >
            {step > 1 ? '← Back' : 'Cancel'}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={nextStep}
              className="py-3 px-6 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center gap-2 shadow-lg transition-all"
            >
              <span>Continue</span>
              <ChevronRight size={14} className="stroke-[2.5]" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              className="py-3 px-7 rounded-full bg-[#f4ebe1] hover:bg-[#eadecf] active:scale-[0.99] text-black font-semibold text-xs tracking-wide flex items-center gap-2 shadow-lg transition-all"
            >
              {loading ? 'Creating RFQ…' : 'Launch Auction Floor'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs text-cream-muted mb-1.5 font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[#080c14]/85 border border-white/10 focus:border-white/30 rounded-xl px-4 py-2.5 text-xs text-cream placeholder-slate-500 font-mono focus:outline-none transition-colors"
      />
      {error && <p className="text-xs text-red-400 font-mono mt-1">{error}</p>}
    </div>
  )
}
