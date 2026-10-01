export interface DataTableColumn {
  key: string;
  label: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Mono tabular figures. */
  numeric?: boolean;
  sortable?: boolean;
  sortValue?: (row: any) => number | string;
  render?: (row: any) => React.ReactNode;
  width?: number | string;
}
export interface DataTableProps {
  columns: DataTableColumn[];
  rows: any[];
  rowKey?: string;
  onRowClick?: (row: any) => void;
  selectedKey?: string | number;
  /** 40px rows instead of 52px. */
  dense?: boolean;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  className?: string;
}
export declare function DataTable(props: DataTableProps): JSX.Element;
