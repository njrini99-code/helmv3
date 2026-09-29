export interface ScoreTrendRound { label: string; score: number }
export interface ScoreTrendEvent { /** Round index the note points at. */ index: number; text: string }
export interface ScoreTrendProps {
  rounds: ScoreTrendRound[];
  par?: number;
  /** Annotations drawn above the line: equipment change, season best. */
  events?: ScoreTrendEvent[];
  /** Show the scoreboard strip aligned under the line. */
  board?: boolean;
  /** Design width of the plot (scales to its container). */
  width?: number;
  title?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function ScoreTrend(props: ScoreTrendProps): JSX.Element;
