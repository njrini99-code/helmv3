export interface ScoreMarkProps {
  score?: number | null;
  par?: number;
  /** Highlight the hole being played. */
  current?: boolean;
  /** sm = 21px for compact strips (RoundCard). */
  size?: 'sm' | 'md';
  className?: string;
}
export declare function ScoreMark(props: ScoreMarkProps): JSX.Element;
