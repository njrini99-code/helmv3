export interface PredictionReason { text: string; /** Strokes gained contribution. Gains green, losses amber. */ value: number }
export interface PredictionCardProps {
  /** Predicted score, e.g. 73. */
  score: number;
  low: number;
  high: number;
  /** 0–100. Tightens the dashed landing ellipse. */
  confidence: number;
  /** Player's scoring average; marked under the scale. */
  average: number;
  reasons?: PredictionReason[];
  title?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function PredictionCard(props: PredictionCardProps): JSX.Element;
