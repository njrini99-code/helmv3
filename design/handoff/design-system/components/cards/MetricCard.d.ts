export interface MetricCardProps {
  label: React.ReactNode;
  /** Lucide name, shown in a small green tile. */
  icon?: string;
  /** Window chip: "Last 10". */
  period?: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: { value: React.ReactNode; direction?: 'up' | 'down' | 'flat'; tone?: 'positive' | 'negative' | 'neutral' };
  /** Comparison caption after the delta: "vs. previous 10". */
  compare?: React.ReactNode;
  /** Series for the full-bleed area chart. */
  trend?: number[];
  goodWhen?: 'up' | 'down';
  /** Flip the chart so improvement rises (scoring). */
  invert?: boolean;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function MetricCard(props: MetricCardProps): JSX.Element;
