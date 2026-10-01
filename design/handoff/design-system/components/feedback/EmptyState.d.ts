export interface EmptyStateProps {
  /** Lucide name. */
  icon?: string;
  title: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}
export declare function EmptyState(props: EmptyStateProps): JSX.Element;
