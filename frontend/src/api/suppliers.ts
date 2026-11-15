import client from './client'

export interface SupplierItem {
  id: string
  display_name: string
  is_active: boolean
}

export const suppliersApi = {
  list: () => client.get<SupplierItem[]>('/suppliers').then(r => r.data),
}
