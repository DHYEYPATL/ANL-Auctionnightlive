/**
 * Countdown — HD-RT-01: uses performance.now() anchored to server_now,
 * not Date.now(). Display-only — never used to accept or reject bids.
 */
import React, { useEffect, useState } from 'react'
import { clsx } from 'clsx'

interface CountdownProps {
  targetDate: string
  label?: string
  urgent?: boolean
  serverNow?: () => number  // optional: estimated server time fn from useAuctionPolling
}

function pad(n: number) {
  return String(Math.max(0, n)).padStart(2, '0')
}

export function Countdown({ targetDate, label, urgent, serverNow }: CountdownProps) {
  const targetMs = new Date(targetDate).getTime()

  const getRemaining = () => {
    const now = serverNow ? serverNow() : Date.now()
    return Math.max(0, targetMs - now)
  }

  const [remaining, setRemaining] = useState(() => getRemaining())

  useEffect(() => {
    const id = setInterval(() => setRemaining(getRemaining()), 500)
    return () => clearInterval(id)
  }, [targetDate, serverNow])

  const totalSecs = Math.floor(remaining / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const isUrgent = urgent || remaining < 5 * 60 * 1000

  if (remaining === 0) {
    return (
      <div className="text-status-closed text-sm tabular">
        {label && <span className="text-slate-500 mr-2 text-xs">{label}</span>}
        <span>Closing…</span>
      </div>
    )
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      {label && <span className="text-slate-500 text-xs mr-1">{label}</span>}
      <div
        className={clsx(
          'flex items-center gap-1 tabular font-mono text-sm font-semibold',
          isUrgent ? 'text-status-force-closed' : 'text-slate-200'
        )}
      >
        {h > 0 && (
          <>
            <span className="bg-base-700 px-1.5 py-0.5 rounded">{pad(h)}</span>
            <span className="text-slate-600">:</span>
          </>
        )}
        <span className="bg-base-700 px-1.5 py-0.5 rounded">{pad(m)}</span>
        <span className="text-slate-600">:</span>
        <span className={clsx('bg-base-700 px-1.5 py-0.5 rounded', isUrgent && 'animate-pulse')}>{pad(s)}</span>
      </div>
    </div>
  )
}
