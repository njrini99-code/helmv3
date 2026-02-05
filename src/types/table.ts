export interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
  width?: string; // e.g., 'w-[200px]', 'flex-1', 'w-20'
  align?: 'left' | 'center' | 'right';
  sticky?: boolean; // For horizontal scroll mode - makes column stick to left edge
  cell?: (row: T, index: number) => React.ReactNode; // Custom cell renderer
}

/**
 * Responsive mobile view modes:
 * - 'card': Always render as stacked cards on mobile (<lg), table on desktop
 * - 'scroll': Horizontal scroll with optional sticky first column on mobile
 * - 'adaptive': Auto-detect based on column count (1-3 = table, 4+ = cards)
 */
export type MobileViewMode = 'card' | 'scroll' | 'adaptive';

export interface TableProps<T> {
  data: T[];
  columns: Column<T>[];

  // Selection
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  getRowId: (row: T) => string;

  // Sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  onSort?: (column: string, direction: 'asc' | 'desc') => void;

  // Pagination
  page?: number;
  pageSize?: number;
  totalCount?: number;
  onPageChange?: (page: number) => void;

  // Row actions
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => RowAction[];

  // States
  isLoading?: boolean;
  emptyState?: React.ReactNode;

  // Styling
  className?: string;
  compact?: boolean; // Smaller row padding

  // Responsive mobile behavior
  mobileView?: MobileViewMode;

  /** Column IDs to hide on mobile viewports (<lg) */
  hiddenColumnsMobile?: string[];

  /** Custom card renderer for mobile card mode. Receives row data and actions. */
  renderMobileCard?: (row: T, actions: RowAction[]) => React.ReactNode;
}

export interface RowAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}
