export interface SurfaceProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Hairline under the header. Default none — spacing separates. */
  rule?: 'hair' | 'none';
  /** Larger 18px display title for a featured card. */
  serif?: boolean;
  /** default = white card; flat = hairline only; raised = floats; feature = deep Augusta green (one per view). */
  variant?: 'default' | 'flat' | 'raised' | 'feature';
  footer?: React.ReactNode;
  /** false = children fill edge-to-edge (tables, charts). */
  padded?: boolean;
  as?: string;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Surface(props: SurfaceProps): JSX.Element;
