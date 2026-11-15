import client from './client'
import type { BidResponse } from '../types/api'

export const bidsApi = {
  submit: (rfqId: string, data: unknown, idempotencyKey: string) =>
    client.post<BidResponse>(`/rfqs/${rfqId}/bids`, data, {
      headers: { 'Idempotency-Key': idempotencyKey },
    }).then(r => r.data),

  list: (rfqId: string, afterId?: string, limit = 50) =>
    client.get(`/rfqs/${rfqId}/bids`, {
      params: { after_id: afterId, limit },
    }).then(r => r.data),
}
