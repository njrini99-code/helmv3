export interface NamePlateProps {
  /** Leaderboard position: 1, "T3". */
  pos?: React.ReactNode;
  name: string;
  /** Relative to par. Under par renders red, per leaderboard convention. */
  score?: number;
  /** "Theo Marchetti" → "T. MARCHETTI". */
  abbreviate?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
export declare function NamePlate(props: NamePlateProps): JSX.Element;
