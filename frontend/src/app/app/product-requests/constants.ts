import type { ProductRequestStatus, ProductRequestType } from '@/lib/productRequestApi';

export const STATUS_OPTIONS = [
  { label: 'All statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'In Review', value: 'inReview' },
  { label: 'Approved', value: 'approved' },
  { label: 'Completed', value: 'completed' },
  { label: 'Rejected', value: 'rejected' },
];

export const REQUEST_TYPE_OPTIONS = [
  { label: 'All request types', value: '' },
  { label: 'New product', value: 'newProduct' },
  { label: 'Update product', value: 'updateProduct' },
  { label: 'Report error', value: 'reportError' },
  { label: 'Price update', value: 'priceUpdate' },
];

export const PRIORITY_OPTIONS = [
  { label: 'Any priority', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Normal', value: 'normal' },
  { label: 'Low', value: 'low' },
];

export const DATE_RANGE_OPTIONS = [
  { label: 'Any time', value: 'any' },
  { label: 'Today', value: 'today' },
  { label: 'Last 7 days', value: '7d' },
  { label: 'Last 30 days', value: '30d' },
] as const;

export type DateRangeFilter = (typeof DATE_RANGE_OPTIONS)[number]['value'];

export type Filters = {
  status: string;
  requestType: string;
  priority: string;
  search: string;
  page: number;
  pageSize: number;
  dateRange: DateRangeFilter;
};

export const defaultFilters: Filters = {
  status: '',
  requestType: '',
  priority: '',
  search: '',
  page: 1,
  pageSize: 25,
  dateRange: 'any',
};

export const STATUS_TRANSITIONS: Record<ProductRequestStatus, ProductRequestStatus[]> = {
  pending: ['inReview', 'rejected'],
  inReview: ['approved', 'rejected'],
  approved: ['completed', 'pending'],
  completed: ['pending'],
  rejected: ['pending'],
};

export const STATUS_META: Record<ProductRequestStatus, { label: string; badge: string }> = {
  pending: { label: 'Pending', badge: 'bg-amber-100 text-amber-700' },
  inReview: { label: 'In Review', badge: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Approved', badge: 'bg-sky-100 text-sky-700' },
  completed: { label: 'Completed', badge: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', badge: 'bg-rose-100 text-rose-700' },
};

export const REQUEST_TYPE_META: Record<ProductRequestType, { label: string; badge: string; description: string }> = {
  newProduct: { label: 'New product', badge: 'bg-blue-50 text-blue-700', description: 'Add a completely new product to catalogue' },
  updateProduct: { label: 'Update product', badge: 'bg-purple-50 text-purple-700', description: 'Update existing product information' },
  reportError: { label: 'Report error', badge: 'bg-rose-50 text-rose-700', description: 'Flag incorrect information that needs urgent attention' },
  priceUpdate: { label: 'Price update', badge: 'bg-amber-50 text-amber-700', description: 'Update price at a specific store/branch' },
};

export const PRIORITY_META: Record<string, { label: string; badge: string }> = {
  high: { label: 'High', badge: 'bg-rose-100 text-rose-700' },
  normal: { label: 'Normal', badge: 'bg-gray-100 text-gray-700' },
  low: { label: 'Low', badge: 'bg-emerald-100 text-emerald-700' },
};
