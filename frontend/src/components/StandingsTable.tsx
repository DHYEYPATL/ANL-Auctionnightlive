import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { StandingRow } from '../types/api'
import { clsx } from 'clsx'

const rankStyle: Record<number, string> = {
  1: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  2: 'text-slate-300 bg-white/[0.05] border-white/10',
  3: 'text-orange-600 bg-orange-900/20 border-orange-700/30',
}

export function StandingsTable({ standings, currency, isBuyer }: { standings: StandingRow[]; currency: string; isBuyer: boolean }) {
  if (!standings.length) return (
    <div className="flex flex-col items-center py-12 text-slate-700">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-3 opacity-30"><path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/></svg>
      <p className="text-sm">No bids yet</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-white/[0.05]">
            {['Rank','Supplier', ...(isBuyer ? ['Freight','Origin','Dest','Days','Valid'] : []), `Total (${currency})`,'Time'].map(h => (
              <th key={h} className="pb-2.5 pr-3 text-[10px] font-semibold text-slate-700 uppercase tracking-widest whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {standings.map(row => (
              <motion.tr key={`${row.rank_number}-${row.supplier_label}`}
                layout
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                transition={{ duration: 0.25 }}
                className={clsx(
                  'border-b border-white/[0.03] transition-colors',
                  row.rank_number === 1 && 'bg-amber-500/[0.025]',
                  row.is_self && 'ring-1 ring-inset ring-accent/15',
                )}>
                <td className="py-3 pr-3">
                  <span className={clsx('inline-flex items-center justify-center w-8 h-6 rounded-lg text-xs font-bold border',
                    rankStyle[row.rank_number] ?? 'text-slate-600 bg-white/[0.03] border-white/[0.06]')}>
                    {row.rank_label}
                  </span>
                </td>
                <td className="py-3 pr-3 text-slate-300 text-sm font-medium">
                  {row.supplier_label}
                  {row.is_self && <span className="ml-1.5 text-[10px] text-accent-light">you</span>}
                </td>
                {isBuyer && <>
                  <td className="py-3 pr-3 tabular text-right text-slate-500 text-xs">{row.freight_charge ?? '—'}</td>
                  <td className="py-3 pr-3 tabular text-right text-slate-500 text-xs">{row.origin_charge ?? '—'}</td>
                  <td className="py-3 pr-3 tabular text-right text-slate-500 text-xs">{row.destination_charge ?? '—'}</td>
                  <td className="py-3 pr-3 text-slate-500 text-xs">{row.transit_time_days != null ? `${row.transit_time_days}d` : '—'}</td>
                  <td className="py-3 pr-3 text-slate-500 text-xs">{row.valid_until ?? '—'}</td>
                </>}
                <td className="py-3 pr-3 tabular text-right font-bold text-slate-200">{row.total_amount}</td>
                <td className="py-3 tabular text-right text-slate-700 text-xs">{new Date(row.accepted_at).toLocaleTimeString()}</td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}
