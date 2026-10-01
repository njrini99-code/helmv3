export interface StatStripItem {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: { value: React.ReactNode; direction?: 'up' | 'down' | 'flat'; tone?: 'positive' | 'negative' | 'neutral' };
  note?: React.ReactNode;
  /** 0–100 progress bar under the value (rates like GIR %). */
  bar?: number;
  /** One lead figure gets a larger value and sage wash. */
  lead?: boolean;
}
export interface StatStripProps {
  items: StatStripItem[];
  className?: string;
  style?: React.CSSProperties;
}
export declare function StatStrip(props: StatStripProps): JSX.Element;
