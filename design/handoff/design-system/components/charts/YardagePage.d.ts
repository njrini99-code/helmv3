export interface YardagePageProps {
  /** Condensed uppercase page title: "Scoring · last 12 rounds". */
  title?: React.ReactNode;
  /** Right-aligned condensed meta: "Par 72". */
  meta?: React.ReactNode;
  /** The head pro's one-line read, set in green italic under the chart. Calm, exact, says why. */
  note?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function YardagePage(props: YardagePageProps): JSX.Element;
