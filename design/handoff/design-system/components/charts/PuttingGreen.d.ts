export interface PuttBand { band: string; made: number; attempts: number; /** Team or tour make %, for the below-benchmark amber flag. */ benchmark: number }
export interface PuttingGreenProps {
  /** Up to 5 distance bands, nearest first. Ring shade = make rate. */
  rows: PuttBand[];
  title?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function PuttingGreen(props: PuttingGreenProps): JSX.Element;
