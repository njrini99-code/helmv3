export interface SGRow { label: string; value: number; /** Emphasize the row the claim is about. */ focus?: boolean }
export interface StrokesGainedTornadoProps {
  rows: SGRow[];
  /** Axis half-width in strokes. Default: max |value| rounded up to 0.5. */
  max?: number;
  caption?: React.ReactNode;
  reference?: React.ReactNode;
  className?: string;
}
export declare function StrokesGainedTornado(props: StrokesGainedTornadoProps): JSX.Element;
