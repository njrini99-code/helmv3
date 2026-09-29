export interface FilterPillProps {
  selected?: boolean;
  onToggle?: (next: boolean) => void;
  /** When provided, a selected pill shows an × to clear. */
  onRemove?: () => void;
  /** Lucide name. */
  icon?: string;
  children: React.ReactNode;
  className?: string;
}
export declare function FilterPill(props: FilterPillProps): JSX.Element;
