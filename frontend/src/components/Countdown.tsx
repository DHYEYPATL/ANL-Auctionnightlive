import React, { useEffect, useState } from 'react'
import { clsx } from 'clsx'

interface Props { targetDate: string; label?: string; urgent?: boolean; serverNow?: () => number }

function pad(n: number) { return String(Math.max(0, n)).padStart(2, '0') }

export function Countdown({ targetDate, label, urgent, serverNow }: Props) {
  const target = new Date(targetDate).getTime()
  const getR = () => Math.max(0, target - (serverNow ? serverNow() : Date.now()))
  const [r, setR] = useState(getR)

  useEffect(() => {
    const id = setInterval(() => setR(getR()), 500)
    return () => clearInterval(id)
  }, [targetDate, serverNow])

  const s = Math.floor(r / 1000)
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  const hot = urgent || r < 5 * 60 * 1000

  if (r === 0) return (
    <span className="text-status-closed text-xs font-medium">
      {label && <span className="text-slate-700 mr-1.5 text-[10px]">{label}</span>}Closing…
    </span>
  )

  return (
    <div className="inline-flex items-center gap-1">
      {label && <span className="text-[10px] text-slate-700 mr-1">{label}</span>}
      <div className={clsx('flex items-center gap-0.5 font-mono text-sm font-bold tabular', hot ? 'text-status-force-closed' : 'text-slate-200')}>
        {h > 0 && <><Digit v={pad(h)} /><Sep /></>}
        <Digit v={pad(m)} /><Sep /><Digit v={pad(sec)} hot={hot} />
      </div>
    </div>
  )
}

function Digit({ v, hot }: { v: string; hot?: boolean }) {
  return (
    <span className={clsx('px-1.5 py-0.5 rounded-lg text-xs font-mono font-semibold border', hot ? 'bg-red-500/20 text-red-300 border-red-500/30' : 'bg-white/[0.08] text-cream border-white/[0.08]')}>{v}</span>
  )
}
function Sep() { return <span className="text-cream-muted text-xs mx-0.5">:</span> }
