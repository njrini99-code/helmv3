export interface PopoverItem { label: React.ReactNode; icon?: string; kbd?: string; danger?: boolean; onSelect?: () => void }
export interface PopoverPanelProps {
  label?: React.ReactNode;
  /** Items, or the string "separator". */
  items: Array<PopoverItem | 'separator'>;
  className?: string;
  style?: React.CSSProperties;
}
export declare function PopoverPanel(props: PopoverPanelProps): JSX.Element;
