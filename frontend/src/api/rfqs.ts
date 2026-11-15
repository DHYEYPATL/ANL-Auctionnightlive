import client from './client'
import type { Rfq } from '../types/api'

export const rfqApi = {
  list: () => client.get<Rfq[]>('/rfqs').then(r => r.data),
  get: (id: string) => client.get<Rfq>(`/rfqs/${id}`).then(r => r.data),
  create: (data: unknown) => client.post<Rfq>('/rfqs', data).then(r => r.data),
  patch: (id: string, data: unknown) => client.patch<Rfq>(`/rfqs/${id}`, data).then(r => r.data),
  publish: (id: string) => client.post<Rfq>(`/rfqs/${id}/publish`).then(r => r.data),
  cancel: (id: string) => client.post<Rfq>(`/rfqs/${id}/cancel`).then(r => r.data),
}
