export interface Column<T> {
  id: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  sortable?: boolean;
  width?: string; // e.g., 'w-[200px]', 'flex-1', 'w-20'
  align?: 'left' | 'center' | 'right';
  sticky?: boolean; // For horizontal scroll
  cell?: (row: T, index: number) => React.ReactNode; // Custom cell renderer
}

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
}

export interface RowAction {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}
