import client from './client'
import type { StandingsResponse } from '../types/api'

export const standingsApi = {
  get: (rfqId: string) =>
    client.get<StandingsResponse>(`/rfqs/${rfqId}/standings`).then(r => r.data),

  /**
   * HD-RT-03: ETag-aware GET. Returns null on 304 (no change).
   * HD-RT-04: no-store — keep ETag in memory, not in browser cache.
   */
  getWithEtag: async (
    rfqId: string,
    etag: string | undefined,
    signal?: AbortSignal
  ): Promise<(StandingsResponse & { _etag?: string }) | null> => {
    const headers: Record<string, string> = {}
    if (etag) headers['If-None-Match'] = etag

    const response = await fetch(`/api/v1/rfqs/${rfqId}/standings`, {
      headers: { ...headers, Authorization: `Bearer ${(await import('./client')).getToken() ?? ''}` },
      signal,
      cache: 'no-store',  // HD-RT-04
    })

    if (response.status === 304) return null
    if (!response.ok) throw new Error(`standings ${response.status}`)

    const data: StandingsResponse = await response.json()
    const receivedEtag = response.headers.get('ETag') ?? undefined
    return { ...data, _etag: receivedEtag }
  },
}
