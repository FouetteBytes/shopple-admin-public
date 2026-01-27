export interface ClassificationHistoryEvent {
  id: string
  event_type: string
  summary: string
  timestamp: string
  details?: Record<string, any>
  duration_seconds?: number
  total_products?: number
  successful?: number
  failed?: number
  metadata?: Record<string, any>
}

export interface ClassificationCloudFile {
  cloud_path: string
  filename: string
  supermarket?: string
  supermarket_slug?: string
  custom_name?: string
  classification_date?: string
  upload_time?: string
  updated?: string
  size?: number
  metadata?: Record<string, any>
}
