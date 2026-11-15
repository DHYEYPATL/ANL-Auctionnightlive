import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { StandingRow } from '../types/api'
import { clsx } from 'clsx'

interface StandingsTableProps {
  standings: StandingRow[]
  currency: string
  isBuyer: boolean
}

const rankColors: Record<number, string> = {
  1: 'text-amber-400 bg-amber-400/10 border-amber-400/30',
  2: 'text-slate-300 bg-white/[0.06] border-white/10',
  3: 'text-amber-700 bg-amber-900/20 border-amber-700/30',
}

export function StandingsTable({ standings, currency, isBuyer }: StandingsTableProps) {
  if (standings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
        <div className="w-12 h-12 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
          <span className="text-xl">—</span>
        </div>
        <p className="text-sm">No bids received yet</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-500 text-xs border-b border-white/[0.06]">
            <th className="pb-3 pr-4 font-medium">Rank</th>
            <th className="pb-3 pr-4 font-medium">Supplier</th>
            {isBuyer && (
              <>
                <th className="pb-3 pr-4 font-medium tabular text-right">Freight</th>
                <th className="pb-3 pr-4 font-medium tabular text-right">Origin</th>
                <th className="pb-3 pr-4 font-medium tabular text-right">Destination</th>
                <th className="pb-3 pr-4 font-medium">Transit</th>
                <th className="pb-3 pr-4 font-medium">Valid Until</th>
              </>
            )}
            <th className="pb-3 pr-4 font-medium tabular text-right">Total ({currency})</th>
            <th className="pb-3 font-medium text-right">Bid Time</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence mode="popLayout">
            {standings.map((row) => (
              <motion.tr
                key={row.rank_number}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.3 }}
                className={clsx(
                  'border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors',
                  row.rank_number === 1 && 'bg-amber-400/[0.03]',
                  row.is_self && 'ring-1 ring-inset ring-accent/20',
                )}
              >
                <td className="py-3 pr-4">
                  <span
                    className={clsx(
                      'inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold border',
                      rankColors[row.rank_number] ?? 'text-slate-400 bg-white/[0.04] border-white/[0.06]'
                    )}
                  >
                    {row.rank_label}
                  </span>
                </td>
                <td className="py-3 pr-4 text-slate-300">{row.supplier_label}</td>
                {isBuyer && (
                  <>
                    <td className="py-3 pr-4 tabular text-right text-slate-400">{row.freight_charge ?? '—'}</td>
                    <td className="py-3 pr-4 tabular text-right text-slate-400">{row.origin_charge ?? '—'}</td>
                    <td className="py-3 pr-4 tabular text-right text-slate-400">{row.destination_charge ?? '—'}</td>
                    <td className="py-3 pr-4 text-slate-400">{row.transit_time_days != null ? `${row.transit_time_days}d` : '—'}</td>
                    <td className="py-3 pr-4 text-slate-400">{row.valid_until ?? '—'}</td>
                  </>
                )}
                <td className="py-3 pr-4 tabular text-right font-semibold text-slate-200">{row.total_amount}</td>
                <td className="py-3 tabular text-right text-slate-500 text-xs">
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
