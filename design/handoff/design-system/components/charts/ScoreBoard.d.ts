export interface ScoreBoardRound { label: string; score: number }
export interface ScoreBoardProps {
  /** Each round posts to a white hand-operated tile relative to par: red under, ink over, green E. */
  rounds: ScoreBoardRound[];
  par?: number;
  className?: string;
  style?: React.CSSProperties;
}
export declare function ScoreBoard(props: ScoreBoardProps): JSX.Element;
