import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import client from '../api/client'

interface Supplier { id: string; display_name: string }

function utc(v: string) {
  if (!v) return ''
  try { return new Date(v).toUTCString().replace('GMT','UTC') } catch { return '' }
}

export default function CreateRfqPage() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [step, setStep] = useState(1)

  const [form, setForm] = useState({
    name: '', reference_id: '', currency: 'USD', service_date: '',
    start_at: '', scheduled_close_at: '', forced_close_at: '',
    supplier_ids: [] as string[],
    trigger_window_minutes: '10', extension_duration_minutes: '5',
    triggers: ['BID_RECEIVED'] as string[],
  })

  useEffect(() => {
    client.get('/api/v1/suppliers').then(r => setSuppliers(r.data)).catch(() => {})
  }, [])

  const set = (k: string, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => { const n = {...e}; delete n[k]; return n })
  }

  const toggleTrigger = (t: string) =>
    set('triggers', form.triggers.includes(t) ? form.triggers.filter(x => x !== t) : [...form.triggers, t])

  const toggleSupplier = (id: string) =>
    set('supplier_ids', form.supplier_ids.includes(id) ? form.supplier_ids.filter(x => x !== id) : [...form.supplier_ids, id])

  function validate1() {
    const e: Record<string,string> = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.reference_id.trim()) e.reference_id = 'Required'
    if (!form.service_date) e.service_date = 'Required'
    setErrors(e); return !Object.keys(e).length
  }

  function validate2() {
    const e: Record<string,string> = {}
    if (!form.start_at) e.start_at = 'Required'
    if (!form.scheduled_close_at) e.scheduled_close_at = 'Required'
    if (!form.forced_close_at) e.forced_close_at = 'Required'
    if (form.start_at && form.scheduled_close_at && new Date(form.start_at) >= new Date(form.scheduled_close_at))
      e.start_at = 'Must be before bid close'
    if (form.scheduled_close_at && form.forced_close_at && new Date(form.scheduled_close_at) >= new Date(form.forced_close_at))
      e.forced_close_at = 'Must be after bid close'
    setErrors(e); return !Object.keys(e).length
  }

  function validate3() {
    const e: Record<string,string> = {}
    if (!form.supplier_ids.length) e.supplier_ids = 'Select at least one supplier'
    setErrors(e); return !Object.keys(e).length
  }

  function validate4() {
    const e: Record<string,string> = {}
    if (parseInt(form.trigger_window_minutes) < 1) e.trigger_window_minutes = 'Min 1 minute'
    if (parseInt(form.extension_duration_minutes) < 1) e.extension_duration_minutes = 'Min 1 minute'
    if (!form.triggers.length) e.triggers = 'Select at least one trigger'
    setErrors(e); return !Object.keys(e).length
  }

  const nextStep = () => {
    if (step === 1 && !validate1()) return
    if (step === 2 && !validate2()) return
    if (step === 3 && !validate3()) return
    setStep(s => s + 1)
  }

  async function handleCreate() {
    if (!validate4()) return
    setLoading(true)
    try {
      const rfq = await rfqApi.create({
        name: form.name, reference_id: form.reference_id, currency: form.currency.toUpperCase(),
        service_date: form.service_date,
        start_at: new Date(form.start_at).toISOString(),
        scheduled_close_at: new Date(form.scheduled_close_at).toISOString(),
        forced_close_at: new Date(form.forced_close_at).toISOString(),
        supplier_ids: form.supplier_ids,
        auction_config: {
          trigger_window_minutes: parseInt(form.trigger_window_minutes),
          extension_duration_minutes: parseInt(form.extension_duration_minutes),
          triggers: form.triggers,
        },
      })
      navigate(`/auctions/${rfq.id}`)
    } catch (err: unknown) {
      const msg = (err as {response?:{data?:{error?:{message?:string}}}})?.response?.data?.error?.message ?? 'Failed'
      setErrors({ _form: msg })
    } finally {
      setLoading(false)
    }
  }

  const STEPS = ['Details', 'Schedule', 'Suppliers', 'Rules']

  return (
    <div className="p-7 max-w-2xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-grad tracking-tight">New Auction</h1>
        <p className="text-slate-600 text-sm mt-1">Configure a British reverse auction RFQ</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0 mb-8">
        {STEPS.map((s, i) => (
          <React.Fragment key={s}>
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                i + 1 < step ? 'bg-accent text-white' :
                i + 1 === step ? 'bg-accent/20 text-accent-light border border-accent/40' :
                'bg-white/[0.04] text-slate-700 border border-white/[0.06]'
              }`}>
                {i + 1 < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs font-medium ${i + 1 === step ? 'text-slate-300' : 'text-slate-700'}`}>{s}</span>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${i + 1 < step ? 'bg-accent/30' : 'bg-white/[0.05]'}`} />}
          </React.Fragment>
        ))}
      </div>

      {errors._form && (
        <div className="mb-4 px-4 py-3 rounded-xl text-xs text-red-300 bg-red-500/10 border border-red-500/20">{errors._form}</div>
      )}

      <div className="glass rounded-3xl p-6">
        {/* Step 1: Details */}
        {step === 1 && (
          <div className="space-y-4 animate-fade-up">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">RFQ Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Auction Name" value={form.name} onChange={v => set('name', v)} error={errors.name} placeholder="Mumbai–Singapore Freight" />
              <Field label="Reference ID" value={form.reference_id} onChange={v => set('reference_id', v)} error={errors.reference_id} placeholder="RFQ-2026-001" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-medium">Currency</label>
                <select value={form.currency} onChange={e => set('currency', e.target.value)}
                  className="input-dark">
                  {['USD','EUR','GBP','INR','SGD','AED','AUD','CAD'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1.5 font-medium">Service Date</label>
                <input type="date" value={form.service_date} onChange={e => set('service_date', e.target.value)}
                  className="input-dark" />
                {errors.service_date && <p className="text-xs text-red-400 mt-1">{errors.service_date}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Schedule */}
        {step === 2 && (
          <div className="space-y-4 animate-fade-up">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">Schedule</h2>
            {[
              { key:'start_at', label:'Bid Start' },
              { key:'scheduled_close_at', label:'Bid Close' },
              { key:'forced_close_at', label:'Hard Stop (Forced Close)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs text-slate-500 mb-1.5 font-medium">{label}</label>
                <input type="datetime-local" value={(form as unknown as Record<string,string>)[key]}
                  onChange={e => set(key, e.target.value)} className="input-dark" />
                {(form as unknown as Record<string,string>)[key] && (
                  <p className="text-[11px] text-slate-700 mt-1 font-mono">{utc((form as unknown as Record<string,string>)[key])}</p>
                )}
                {errors[key] && <p className="text-xs text-red-400 mt-1">{errors[key]}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Step 3: Suppliers */}
        {step === 3 && (
          <div className="animate-fade-up">
            <h2 className="text-sm font-semibold text-slate-300 mb-4">
              Invite Suppliers
              <span className="ml-2 text-xs text-accent-light font-normal">{form.supplier_ids.length} selected</span>
            </h2>
            {suppliers.length === 0 ? (
              <div className="text-center py-8 text-slate-600 text-sm">
                No suppliers in system. <br/>
                <span className="text-xs text-slate-700">Run <code className="bg-white/[0.05] px-1 rounded">docker compose exec backend python app/db/seed.py</code></span>
              </div>
            ) : (
              <div className="space-y-2">
                {suppliers.map(s => (
                  <label key={s.id}
                    className={`flex items-center gap-3 p-3.5 rounded-xl cursor-pointer border transition-all ${
                      form.supplier_ids.includes(s.id)
                        ? 'bg-accent/[0.08] border-accent/25 text-slate-200'
                        : 'bg-white/[0.02] border-white/[0.05] text-slate-500 hover:border-white/10 hover:text-slate-300'
                    }`}
                    onClick={() => toggleSupplier(s.id)}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-all ${
                      form.supplier_ids.includes(s.id) ? 'bg-accent border-accent' : 'border-white/20'
                    }`}>
                      {form.supplier_ids.includes(s.id) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{s.display_name}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            {errors.supplier_ids && <p className="text-xs text-red-400 mt-2">{errors.supplier_ids}</p>}
          </div>
        )}

        {/* Step 4: Rules */}
        {step === 4 && (
          <div className="animate-fade-up space-y-5">
            <h2 className="text-sm font-semibold text-slate-300">Auction Rules</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Trigger Window X (minutes)" type="number" value={form.trigger_window_minutes}
                onChange={v => set('trigger_window_minutes', v)} error={errors.trigger_window_minutes} placeholder="10" />
              <Field label="Extension Duration Y (minutes)" type="number" value={form.extension_duration_minutes}
                onChange={v => set('extension_duration_minutes', v)} error={errors.extension_duration_minutes} placeholder="5" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-2 font-medium">Extension Triggers</label>
              <div className="space-y-2">
                {[
                  { value: 'BID_RECEIVED', label: 'Any bid received in final X minutes' },
                  { value: 'ANY_RANK_CHANGE', label: 'Any supplier rank changes' },
                  { value: 'L1_CHANGE', label: 'The leading supplier changes' },
                ].map(opt => (
                  <label key={opt.value}
                    className={`flex items-start gap-3 p-3.5 rounded-xl cursor-pointer border transition-all ${
                      form.triggers.includes(opt.value)
                        ? 'bg-accent/[0.08] border-accent/25'
                        : 'bg-white/[0.02] border-white/[0.05] hover:border-white/10'
                    }`}
                    onClick={() => toggleTrigger(opt.value)}>
                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center border flex-shrink-0 transition-all ${
                      form.triggers.includes(opt.value) ? 'bg-accent border-accent' : 'border-white/20'
                    }`}>
                      {form.triggers.includes(opt.value) && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                      )}
                    </div>
                    <span className="text-sm text-slate-400">{opt.label}</span>
                  </label>
                ))}
              </div>
              {errors.triggers && <p className="text-xs text-red-400 mt-1">{errors.triggers}</p>}
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              When a matching event occurs in the last X minutes, the close time extends by Y minutes — capped at forced close. One extension per bid.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-between mt-6 pt-5 border-t border-white/[0.05]">
          <button onClick={() => step > 1 ? setStep(s => s - 1) : navigate('/')}
            className="btn-ghost">
            {step > 1 ? '← Back' : 'Cancel'}
          </button>
          {step < 4 ? (
            <button onClick={nextStep} className="btn-primary flex items-center gap-2">
              Next <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
          ) : (
            <button onClick={handleCreate} disabled={loading} className="btn-primary flex items-center gap-2">
              {loading ? <span className="animate-spin">⟳</span> : (
                <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Create Auction</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, error, placeholder, type='text' }: {
  label: string; value: string; onChange: (v:string)=>void; error?: string; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1.5 font-medium">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} className="input-dark" />
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  )
}
