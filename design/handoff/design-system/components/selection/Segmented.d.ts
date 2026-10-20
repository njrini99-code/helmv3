export interface SegmentedOption { value: string; label: React.ReactNode }
export interface SegmentedProps {
  options: Array<SegmentedOption | string>;
  value: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  /** Accessible group label. */
  label?: string;
  className?: string;
}
export declare function Segmented(props: SegmentedProps): JSX.Element;
