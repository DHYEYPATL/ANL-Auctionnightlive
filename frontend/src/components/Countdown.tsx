import React, { useEffect, useState } from 'react'
import { clsx } from 'clsx'

interface CountdownProps {
  targetDate: string
  label?: string
  urgent?: boolean
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function parse(targetDate: string): number {
  return new Date(targetDate).getTime()
}

export function Countdown({ targetDate, label, urgent }: CountdownProps) {
  const [remaining, setRemaining] = useState(() => Math.max(0, parse(targetDate) - Date.now()))

  useEffect(() => {
    const id = setInterval(() => {
      const r = Math.max(0, parse(targetDate) - Date.now())
      setRemaining(r)
    }, 1000)
    return () => clearInterval(id)
  }, [targetDate])

  const totalSecs = Math.floor(remaining / 1000)
  const h = Math.floor(totalSecs / 3600)
  const m = Math.floor((totalSecs % 3600) / 60)
  const s = totalSecs % 60
  const isUrgent = urgent || remaining < 5 * 60 * 1000

  if (remaining === 0) {
    return (
      <div className="text-status-closed text-sm tabular">
        {label && <span className="text-slate-500 mr-2 text-xs">{label}</span>}
        Ended
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
