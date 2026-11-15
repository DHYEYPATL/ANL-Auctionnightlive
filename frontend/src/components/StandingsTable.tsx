import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { StandingRow } from '../types/api'
import { clsx } from 'clsx'

const rankStyle: Record<number, string> = {
  1: 'text-[#f4ebe1] bg-[#f4ebe1]/15 border-[#f4ebe1]/40 shadow-[0_0_14px_rgba(244,235,225,0.25)]',
  2: 'text-slate-200 bg-white/[0.08] border-white/20',
  3: 'text-amber-400 bg-amber-950/40 border-amber-600/30',
}

export function StandingsTable({ standings, currency, isBuyer }: { standings: StandingRow[]; currency: string; isBuyer: boolean }) {
  if (!standings.length) return (
    <div className="flex flex-col items-center py-12 text-cream-muted space-y-2">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="opacity-30">
        <path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>
      </svg>
      <p className="text-xs font-mono text-slate-400">Awaiting opening bids from invited suppliers</p>
    </div>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-white/[0.08]">
            {['Rank', 'Supplier', ...(isBuyer ? ['Freight', 'Origin', 'Dest', 'Days', 'Valid'] : []), `Total (${currency})`, 'Accepted At'].map(h => (
              <th key={h} className="pb-3 pr-3 text-[9px] font-mono tracking-widest text-slate-400 uppercase whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {standings.map(row => (
              <motion.tr
                key={`${row.rank_number}-${row.supplier_label}`}
                layout
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 4 }}
                transition={{ duration: 0.25 }}
                className={clsx(
                  'border-b border-white/[0.04] transition-colors',
                  row.rank_number === 1 && 'bg-[#f4ebe1]/[0.03]',
                  row.is_self && 'ring-1 ring-inset ring-[#f4ebe1]/30 bg-[#f4ebe1]/[0.06]',
                )}
              >
                <td className="py-3.5 pr-3">
                  <span
                    className={clsx(
                      'inline-flex items-center justify-center w-8 h-6 rounded-lg text-xs font-bold border font-mono',
                      rankStyle[row.rank_number] ?? 'text-slate-500 bg-white/[0.03] border-white/[0.06]'
                    )}
                  >
                    {row.rank_label}
                  </span>
                </td>
                <td className="py-3.5 pr-3 text-cream text-xs font-medium">
                  {row.supplier_label}
                  {row.is_self && (
                    <span className="ml-2 text-[9px] font-mono font-bold bg-[#f4ebe1] text-black px-1.5 py-0.5 rounded-full shadow-sm">
                      YOU
                    </span>
                  )}
                </td>
                {isBuyer && (
                  <>
                    <td className="py-3.5 pr-3 tabular text-right text-slate-400 text-xs font-mono">{row.freight_charge ?? '—'}</td>
                    <td className="py-3.5 pr-3 tabular text-right text-slate-400 text-xs font-mono">{row.origin_charge ?? '—'}</td>
                    <td className="py-3.5 pr-3 tabular text-right text-slate-400 text-xs font-mono">{row.destination_charge ?? '—'}</td>
                    <td className="py-3.5 pr-3 text-slate-400 text-xs font-mono">{row.transit_time_days != null ? `${row.transit_time_days}d` : '—'}</td>
                    <td className="py-3.5 pr-3 text-slate-400 text-xs font-mono">{row.valid_until ?? '—'}</td>
                  </>
                )}
                <td className="py-3.5 pr-3 tabular text-right font-bold text-cream font-mono text-sm">
                  {row.total_amount}
                </td>
                <td className="py-3.5 tabular text-right text-slate-400 text-xs font-mono">
                  {new Date(row.accepted_at).toLocaleTimeString()}
                </td>
              </motion.tr>
            ))}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  )
}
