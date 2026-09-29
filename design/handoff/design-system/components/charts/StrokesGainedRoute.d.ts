export interface SGRouteRow { label: string; value: number }
export interface StrokesGainedRouteProps {
  /** In playing order: Off the tee, Approach, Around green, Putting. Gains rise green, losses hang amber. */
  rows: SGRouteRow[];
  /** Strokes that fill the full bar height. */
  max?: number;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function StrokesGainedRoute(props: StrokesGainedRouteProps): JSX.Element;
