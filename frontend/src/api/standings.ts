import client from './client'
import type { StandingsResponse } from '../types/api'

export const standingsApi = {
  get: (rfqId: string) => client.get<StandingsResponse>(`/rfqs/${rfqId}/standings`).then(r => r.data),
}
