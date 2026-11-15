/**
 * Create RFQ page — HD-BID-12: shows UTC preview next to local time fields.
 * HD-BID-11: datetimes with offset required (enforced server-side; UI warns).
 */
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { rfqApi } from '../api/rfqs'
import client from '../api/client'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'

interface SupplierOption { id: string; display_name: string }

function utcPreview(localValue: string): string {
  if (!localValue) return ''
  try {
    const d = new Date(localValue)
    if (isNaN(d.getTime())) return ''
    return d.toUTCString().replace('GMT', 'UTC')
  } catch { return '' }
}

export default function CreateRfqPage() {
  const navigate = useNavigate()
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    name: '',
    reference_id: '',
    currency: 'USD',
    service_date: '',
    start_at: '',
    scheduled_close_at: '',
    forced_close_at: '',
    supplier_ids: [] as string[],
    trigger_window_minutes: '10',
    extension_duration_minutes: '5',
    triggers: [] as string[],
  })

  useEffect(() => {
    client.get('/suppliers').then(r => setSuppliers(r.data)).catch(() => {})
  }, [])

  function set(key: string, value: unknown) {
    setForm(f => ({ ...f, [key]: value }))
    setErrors(e => { const n = { ...e }; delete n[key]; return n })
  }

  function toggleTrigger(t: string) {
    set('triggers', form.triggers.includes(t) ? form.triggers.filter(x => x !== t) : [...form.triggers, t])
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = 'Required'
    if (!form.reference_id.trim()) e.reference_id = 'Required'
    if (!form.service_date) e.service_date = 'Required'
    if (!form.start_at) e.start_at = 'Required'
    if (!form.scheduled_close_at) e.scheduled_close_at = 'Required'
    if (!form.forced_close_at) e.forced_close_at = 'Required'
    if (form.start_at && form.scheduled_close_at && new Date(form.start_at) >= new Date(form.scheduled_close_at))
      e.start_at = 'Bid start must be earlier than bid close.'
    if (form.scheduled_close_at && form.forced_close_at && new Date(form.scheduled_close_at) >= new Date(form.forced_close_at))
      e.forced_close_at = 'Forced close must be later than the scheduled bid close.'
    if (parseInt(form.trigger_window_minutes) < 1) e.trigger_window_minutes = 'Enter a whole number of minutes greater than zero.'
    if (parseInt(form.extension_duration_minutes) < 1) e.extension_duration_minutes = 'Enter a whole number of minutes greater than zero.'
    if (form.triggers.length === 0) e.triggers = 'Select at least one extension trigger.'
    if (form.supplier_ids.length === 0) e.supplier_ids = 'Select at least one supplier.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSaveDraft() {
    if (!validate()) return
    setLoading(true)
    try {
      const rfq = await rfqApi.create({
        name: form.name,
        reference_id: form.reference_id,
        currency: form.currency.toUpperCase(),
        service_date: form.service_date,
        // HD-BID-11: include timezone offset
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
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? 'Failed to create RFQ.'
      setErrors({ _form: msg })
    } finally {
      setLoading(false)
    }
  }

  const triggerOptions = [
    { value: 'BID_RECEIVED', label: 'Bid received in last X minutes' },
    { value: 'ANY_RANK_CHANGE', label: 'Any supplier rank change in last X minutes' },
    { value: 'L1_CHANGE', label: 'L1 supplier change in last X minutes' },
  ]

  function DateTimeField({ id, label, value, onChange, error }: {
    id: string; label: string; value: string; onChange: (v: string) => void; error?: string
  }) {
    return (
      <div>
        <label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>
        <input
          type="datetime-local"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
        />
        {/* HD-BID-12: UTC preview */}
        {value && (
          <p className="text-xs text-slate-600 mt-1">= {utcPreview(value)}</p>
        )}
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    )
  }

  function TextField({ id, label, value, onChange, error }: {
    id: string; label: string; value: string; onChange: (v: string) => void; error?: string
  }) {
    return (
      <div>
        <label className="block text-xs text-slate-400 mb-1.5 font-medium">{label}</label>
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
          className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20"
        />
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>
    )
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white tracking-tight">Create RFQ</h1>
        <p className="text-slate-500 text-sm mt-1">Configure a new British Auction.</p>
      </div>

      {errors._form && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">{errors._form}</div>
      )}

      <div className="space-y-6">
        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">RFQ Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <TextField id="name" label="RFQ Name" value={form.name} onChange={v => set('name', v)} error={errors.name} />
            <TextField id="ref" label="Reference ID" value={form.reference_id} onChange={v => set('reference_id', v)} error={errors.reference_id} />
            <TextField id="currency" label="Currency (ISO-4217)" value={form.currency} onChange={v => set('currency', v)} />
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Service Date</label>
              <input type="date" value={form.service_date} onChange={e => set('service_date', e.target.value)}
                className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50" />
              {errors.service_date && <p className="text-xs text-red-400 mt-1">{errors.service_date}</p>}
            </div>
          </div>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Schedule</h2>
          <p className="text-xs text-slate-600">Times shown in your local zone with UTC equivalent (HD-BID-12).</p>
          <DateTimeField id="start" label="Bid Start" value={form.start_at} onChange={v => set('start_at', v)} error={errors.start_at} />
          <DateTimeField id="close" label="Bid Close" value={form.scheduled_close_at} onChange={v => set('scheduled_close_at', v)} error={errors.scheduled_close_at} />
          <DateTimeField id="forced" label="Forced Close" value={form.forced_close_at} onChange={v => set('forced_close_at', v)} error={errors.forced_close_at} />
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Supplier Access</h2>
          {suppliers.length > 0 ? (
            <div className="space-y-2">
              {suppliers.map(s => (
                <label key={s.id} className="flex items-center gap-3 p-3 rounded-lg bg-base-700/50 cursor-pointer hover:bg-base-700 transition-colors">
                  <input type="checkbox" checked={form.supplier_ids.includes(s.id)}
                    onChange={() => set('supplier_ids', form.supplier_ids.includes(s.id) ? form.supplier_ids.filter(x => x !== s.id) : [...form.supplier_ids, s.id])}
                    className="accent-accent" />
                  <span className="text-sm text-slate-300">{s.display_name}</span>
                </label>
              ))}
              <p className="text-xs text-slate-500">{form.supplier_ids.length} selected</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No suppliers available. Seed the database first.</p>
          )}
          {errors.supplier_ids && <p className="text-xs text-red-400">{errors.supplier_ids}</p>}
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">British Auction Rules</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Trigger Window X (minutes)</label>
              <input type="number" min="1" value={form.trigger_window_minutes} onChange={e => set('trigger_window_minutes', e.target.value)}
                className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50" />
              {errors.trigger_window_minutes && <p className="text-xs text-red-400 mt-1">{errors.trigger_window_minutes}</p>}
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Extension Duration Y (minutes)</label>
              <input type="number" min="1" value={form.extension_duration_minutes} onChange={e => set('extension_duration_minutes', e.target.value)}
                className="w-full bg-base-700 border border-white/[0.08] rounded-lg px-3 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-accent/50" />
              {errors.extension_duration_minutes && <p className="text-xs text-red-400 mt-1">{errors.extension_duration_minutes}</p>}
            </div>
          </div>
          <div className="space-y-2">
            {triggerOptions.map(opt => (
              <label key={opt.value} className="flex items-center gap-3 p-3 rounded-lg bg-base-700/50 cursor-pointer hover:bg-base-700 transition-colors">
                <input type="checkbox" checked={form.triggers.includes(opt.value)} onChange={() => toggleTrigger(opt.value)} className="accent-accent" />
                <span className="text-sm text-slate-300">{opt.label}</span>
              </label>
            ))}
          </div>
          {errors.triggers && <p className="text-xs text-red-400">{errors.triggers}</p>}
          <p className="text-xs text-slate-600">Any matching trigger extends the auction. One bid = at most one extension. Never extends past forced close.</p>
        </Card>

        <div className="flex gap-3">
          <Button onClick={handleSaveDraft} loading={loading} size="lg">Save as Draft</Button>
          <Button variant="ghost" onClick={() => navigate('/')}>Cancel</Button>
        </div>
      </div>
    </div>
  )
}
