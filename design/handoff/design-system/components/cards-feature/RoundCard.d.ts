export interface RoundCardHole { n: number; par: number; score?: number | null }
export interface RoundCardProps {
  course: React.ReactNode;
  /** "Sun 12 Oct · Member tees" */
  meta?: React.ReactNode;
  /** Total strokes; derived from holes when omitted. */
  score?: number;
  /** Relative to par; derived from holes when omitted. */
  toPar?: number;
  /** Right side of the header — usually a Badge. */
  badge?: React.ReactNode;
  /** 2–3 compact figures: [{label:'GIR', value:'13/18'}]. */
  stats?: Array<{ label: string; value: React.ReactNode }>;
  /** Up to 18 holes; rendered as Out / In rows of score marks. */
  holes?: RoundCardHole[];
  actionLabel?: string;
  onOpen?: () => void;
  className?: string;
  style?: React.CSSProperties;
}
export declare function RoundCard(props: RoundCardProps): JSX.Element;
