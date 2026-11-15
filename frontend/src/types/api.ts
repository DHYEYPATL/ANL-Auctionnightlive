export type Role = 'BUYER' | 'SUPPLIER'
export type RfqStatus = 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'CLOSED' | 'FORCE_CLOSED' | 'CANCELLED'
export type TriggerType = 'BID_RECEIVED' | 'ANY_RANK_CHANGE' | 'L1_CHANGE'
export type EventType =
  | 'PUBLISHED'
  | 'BID_SUBMITTED'
  | 'RANK_CHANGED'
  | 'EXTENSION_APPLIED'
  | 'AUCTION_CLOSED'
  | 'AUCTION_FORCE_CLOSED'
  | 'AUCTION_CANCELLED'

export interface User {
  id: string
  email: string
  display_name: string
  role: Role
  supplier_id: string | null
}

export interface AuctionConfig {
  trigger_window_minutes: number
  extension_duration_minutes: number
  triggers: TriggerType[]
}

export interface Rfq {
  id: string
  name: string
  reference_id: string
  currency: string
  service_date: string
  start_at: string
  scheduled_close_at: string
  current_close_at: string
  forced_close_at: string
  status: RfqStatus
  published_at: string | null
  created_at: string
  auction_config: AuctionConfig | null
  invited_supplier_ids: string[]
  current_l1_total: string | null
  participating_supplier_count: number
  accepted_bid_count: number
  extension_count: number
}

export interface ExtensionResult {
  applied: boolean
  previous_close_at: string | null
  new_close_at: string | null
  matched_triggers: TriggerType[]
  capped_by_forced_close: boolean
}

export interface BidResponse {
  bid_id: string
  rfq_id: string
  total_amount: string
  currency: string
  accepted_at: string
  rank: string
  current_l1_total: string | null
  current_close_at: string
  extension: ExtensionResult
}

export interface StandingRow {
  rank_number: number
  rank_label: string
  supplier_id: string | null
  supplier_label: string
  total_amount: string
  freight_charge: string | null
  origin_charge: string | null
  destination_charge: string | null
  transit_time_days: number | null
  valid_until: string | null
  accepted_at: string
}

export interface StandingsResponse {
  rfq_id: string
  standings: StandingRow[]
  current_l1_total: string | null
}

export interface AuctionEvent {
  id: number
  rfq_id: string
  event_type: EventType
  occurred_at: string
  details: Record<string, unknown>
  actor_display_name: string | null
  bid_id: string | null
}

export interface EventsResponse {
  events: AuctionEvent[]
  next_cursor: number | null
}

export interface ApiError {
  error: {
    code: string
    message: string
    details: Record<string, unknown>
    request_id: string
  }
}
