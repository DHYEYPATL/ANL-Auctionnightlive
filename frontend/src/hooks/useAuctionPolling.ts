/**
 * HD-RT-05: setTimeout chain (not setInterval), one in-flight request,
 * AbortController on unmount, jitter ±500ms, exponential backoff on errors,
 * hidden tab polls at 10s, refetches on visibility/focus/online.
 * HD-RT-02: monotonic version guard — ignores older responses.
 * HD-RT-01: server_now clock anchor for countdown.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import type { RfqStatus, StandingsResponse, AuctionEvent } from '../types/api'
import { standingsApi } from '../api/standings'
import { eventsApi } from '../api/events'

interface ClockAnchor {
  serverMs: number
  perf: number
}

interface PollState {
  standings: StandingsResponse | null
  events: AuctionEvent[]
  loading: boolean
  error: string | null
  serverNow: () => number  // returns estimated server time as ms since epoch
}

const TERMINAL: RfqStatus[] = ['CLOSED', 'FORCE_CLOSED', 'CANCELLED']
const ACTIVE_POLL_MS = 3000
const HIDDEN_POLL_MS = 10000
const JITTER_MS = 500

export function useAuctionPolling(rfqId: string, status: RfqStatus): PollState {
  const [standings, setStandings] = useState<StandingsResponse | null>(null)
  const [events, setEvents] = useState<AuctionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const versionRef = useRef<number>(-1)
  const etagRef = useRef<string | undefined>(undefined)
  const anchorRef = useRef<ClockAnchor>({ serverMs: Date.now(), perf: performance.now() })
  const abortRef = useRef<AbortController | null>(null)
  const failsRef = useRef(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMountedRef = useRef(true)

  const serverNow = useCallback(() => {
    return anchorRef.current.serverMs + (performance.now() - anchorRef.current.perf)
  }, [])

  const fetchAll = useCallback(async (signal: AbortSignal) => {
    const t0 = performance.now()
    try {
      // HD-RT-11: standings with ETag, events only when version changed
      const s = await standingsApi.getWithEtag(rfqId, etagRef.current, signal)
      const t1 = performance.now()

      if (s === null) {
        // 304 — no change, keep existing data
        failsRef.current = 0
        return
      }

      // HD-RT-02: monotonic guard
      if (s.version < versionRef.current) return

      versionRef.current = s.version
      etagRef.current = s._etag
      anchorRef.current = {
        serverMs: new Date(s.server_now).getTime() + (t1 - t0) / 2,
        perf: t1,
      }

      setStandings(s)
      setError(null)
      failsRef.current = 0

      // Fetch events when version advanced
      const e = await eventsApi.list(rfqId, undefined, 100)
      if (!signal.aborted && isMountedRef.current) {
        setEvents(e.events)
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return
      failsRef.current++
      setError('Connection interrupted. Retrying…')
    } finally {
      if (isMountedRef.current) setLoading(false)
    }
  }, [rfqId])

  const scheduleNext = useCallback(() => {
    if (!isMountedRef.current) return
    if (TERMINAL.includes(status)) return  // stop after terminal, final snapshot already fetched

    const fails = failsRef.current
    const base = fails > 0 ? Math.min(ACTIVE_POLL_MS * Math.pow(2, fails), 15000) : ACTIVE_POLL_MS
    const jitter = (Math.random() - 0.5) * JITTER_MS
    const wait = document.hidden ? HIDDEN_POLL_MS : base + jitter

    timeoutRef.current = setTimeout(() => {
      abortRef.current = new AbortController()
      fetchAll(abortRef.current.signal).then(scheduleNext)
    }, wait)
  }, [fetchAll, status])

  useEffect(() => {
    isMountedRef.current = true
    setLoading(true)

    abortRef.current = new AbortController()
    fetchAll(abortRef.current.signal).then(scheduleNext)

    // HD-RT-05: refetch on focus, visibilitychange, online
    const handleRefocus = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      fetchAll(abortRef.current.signal).then(scheduleNext)
    }

    document.addEventListener('visibilitychange', handleRefocus)
    window.addEventListener('focus', handleRefocus)
    window.addEventListener('online', handleRefocus)

    return () => {
      isMountedRef.current = false
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      abortRef.current?.abort()
      document.removeEventListener('visibilitychange', handleRefocus)
      window.removeEventListener('focus', handleRefocus)
      window.removeEventListener('online', handleRefocus)
    }
  }, [rfqId, status])

  return { standings, events, loading, error, serverNow }
}
