import client from './client'
import type { EventsResponse } from '../types/api'

export const eventsApi = {
  list: (rfqId: string, afterId?: number, limit = 50) =>
    client.get<EventsResponse>(`/rfqs/${rfqId}/events`, {
      params: { after_id: afterId, limit },
    }).then(r => r.data),
}
