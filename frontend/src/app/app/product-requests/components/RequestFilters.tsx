import type { Filters } from '../constants';
import { DATE_RANGE_OPTIONS, PRIORITY_OPTIONS, REQUEST_TYPE_OPTIONS, STATUS_OPTIONS } from '../constants';
import type { DateRangeFilter } from '../constants';
import { GlassFilterBar, type GlassFilterSelectConfig } from '@/components/shared/GlassFilterBar';

export type RequestFiltersProps = {
  filters: Filters;
  onFiltersChange: (update: Partial<Filters>) => void;
  onRefresh: () => void;
  autoRefresh: boolean;
  onAutoRefreshChange: (value: boolean) => void;
  formattedLastRefresh: string | null;
};

export function RequestFilters({ filters, onFiltersChange, onRefresh, autoRefresh, onAutoRefreshChange, formattedLastRefresh }: RequestFiltersProps) {
  const updateFilters = (partial: Partial<Filters>) => {
    onFiltersChange({ ...partial, page: 1 });
  };

  const handleSelectChange = (key: keyof Filters, value: string) => {
    updateFilters({ [key]: value } as Partial<Filters>);
  };

  const handleDateRangeChange = (value: DateRangeFilter) => {
    updateFilters({ dateRange: value });
  };

  const selectConfigs: GlassFilterSelectConfig[] = [
    {
      label: 'Status',
      value: filters.status,
      options: STATUS_OPTIONS,
      onChange: (value) => handleSelectChange('status', value),
    },
    {
      label: 'Request type',
      value: filters.requestType,
      options: REQUEST_TYPE_OPTIONS,
      onChange: (value) => handleSelectChange('requestType', value),
    },
    {
      label: 'Priority',
      value: filters.priority,
      options: PRIORITY_OPTIONS,
      onChange: (value) => handleSelectChange('priority', value),
    },
    {
      label: 'Time window',
      value: filters.dateRange,
      options: DATE_RANGE_OPTIONS,
      onChange: (value) => handleDateRangeChange(value as DateRangeFilter),
    },
  ];

  return (
    <GlassFilterBar
      searchPlaceholder="Search by product, store, or submitter"
      searchValue={filters.search}
      onSearchChange={(value) => updateFilters({ search: value })}
      selects={selectConfigs}
      onRefresh={onRefresh}
      autoRefresh={autoRefresh}
      onAutoRefreshChange={onAutoRefreshChange}
      lastRefreshedLabel={formattedLastRefresh}
    />
  );
}
