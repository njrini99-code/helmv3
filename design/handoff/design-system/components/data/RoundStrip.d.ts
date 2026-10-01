export interface Hole { n: number; par: number; score?: number | null; yards?: number }
export interface RoundStripProps {
  /** 9 or 18 holes. Unplayed holes: score null. */
  holes: Hole[];
  /** Hole number in play — rendered as a pine tile. */
  current?: number;
  showYards?: boolean;
  className?: string;
}
export declare function RoundStrip(props: RoundStripProps): JSX.Element;
