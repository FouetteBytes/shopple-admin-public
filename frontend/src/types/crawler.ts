export type ScheduleSelectionMode = 'all' | 'store' | 'category';
export type ScheduleBatchMode = 'parallel' | 'sequential';
export type ScheduleType = 'one_time' | 'daily' | 'weekly' | 'interval';
export type LimitMode = 'default' | 'custom' | 'all';

export interface CrawlerSchedule {
  id: string;
  label: string;
  description?: string;
  enabled: boolean;
  batch_mode: ScheduleBatchMode;
  max_items?: number;
  headless_mode?: boolean;
  limit_mode?: LimitMode;
  selection?: Record<string, any>;
  schedule?: Record<string, any>;
  next_run?: string | null;
  last_run?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CrawlerStatus {
  available: boolean;
  loading?: boolean;
  active_crawlers: number;
  total_available: number;
  active_crawlers_details?: Record<string, CrawlerInfo>;
}

export interface CrawlerSpec {
  store: string;
  category: string;
  max_items?: number;
  headless_mode?: boolean;
  limit_mode?: LimitMode;
}

export interface CrawlerInfo {
  crawler_id?: string;
  store: string;
  category: string;
  status: 'inactive' | 'running' | 'completed' | 'error' | 'starting' | 'failed' | 'stopped' | 'uploading';
  items_found?: number;
  count?: number;
  total_products?: number;
  timestamp?: string;
  progress?: number;
  start_time?: string;
  current_step?: string;
  logs?: string[];
  config?: any;
  max_items?: number;
}

export interface CrawlerResult {
  categoryId?: string;
  storeId?: string;
  items_found?: number;
  status?: string;
  timestamp?: string;
  file_path?: string;
  [key: string]: any;
}

export interface CrawlerActivity {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  message: string;
  timestamp: string;
  crawler_id?: string;
  store?: string;
}
