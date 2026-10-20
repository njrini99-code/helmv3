export interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  /** Fill the container width (measured). */
  fluid?: boolean;
  /** auto = green if the series improved, red if it worsened (see goodWhen). */
  tone?: 'auto' | 'accent' | 'negative' | 'muted' | 'ink' | 'inverse';
  /** Which direction is better. Scoring average: "down". */
  goodWhen?: 'up' | 'down';
  /** Flip the y-axis so "better" always points up (use with goodWhen="down"). */
  invert?: boolean;
  /** Monotone curve (no overshoot). */
  smooth?: boolean;
  area?: boolean;
  /** Dashed reference line: "mean" of the series or a fixed value. */
  baseline?: 'mean' | number | null;
  endDot?: boolean;
  strokeWidth?: number;
  /** [top, right, bottom, left] padding inside the plot. */
  inset?: [number, number, number, number];
  /** Change label shown after the line, colored by tone: "−1.4". */
  label?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Sparkline(props: SparklineProps): JSX.Element;
