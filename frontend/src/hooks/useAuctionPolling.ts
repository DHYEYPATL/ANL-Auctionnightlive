import { useEffect, useRef, useState } from 'react'
import type { RfqStatus, StandingsResponse, AuctionEvent } from '../types/api'
import { standingsApi } from '../api/standings'
import { eventsApi } from '../api/events'

interface PollResult {
  standings: StandingsResponse | null
  events: AuctionEvent[]
  loading: boolean
  error: string | null
}

const ACTIVE_STATES: RfqStatus[] = ['ACTIVE', 'SCHEDULED']

export function useAuctionPolling(rfqId: string, status: RfqStatus): PollResult {
  const [standings, setStandings] = useState<StandingsResponse | null>(null)
  const [events, setEvents] = useState<AuctionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAll = async () => {
    try {
      const [s, e] = await Promise.all([
        standingsApi.get(rfqId),
        eventsApi.list(rfqId, undefined, 100),
      ])
      setStandings(s)
      setEvents(e.events)
      setError(null)
    } catch {
      setError('Failed to refresh auction data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setLoading(true)
    fetchAll()

    if (ACTIVE_STATES.includes(status)) {
      intervalRef.current = setInterval(fetchAll, 3000)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [rfqId, status])

  return { standings, events, loading, error }
}
