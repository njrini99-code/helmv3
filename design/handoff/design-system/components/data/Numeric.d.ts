export interface NumericProps {
  label?: React.ReactNode;
  /** Pre-formatted final value. Never animate a count-up. Use "—" for no data. */
  value: React.ReactNode;
  unit?: React.ReactNode;
  delta?: { value: React.ReactNode; direction?: 'up' | 'down' | 'flat'; tone?: 'positive' | 'negative' | 'neutral' };
  /** Window / sample: "Last 10 rounds · 142 shots". */
  note?: React.ReactNode;
  /** xl/l/m = Newsreader figures; s = sans tabular. */
  size?: 'xl' | 'l' | 'm' | 's';
  className?: string;
  style?: React.CSSProperties;
}
export declare function Numeric(props: NumericProps): JSX.Element;
