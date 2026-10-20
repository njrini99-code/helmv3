export interface InsightCardProps {
  /** The person the decision is about — renders an identity header. */
  player?: { name: string; meta?: React.ReactNode; initials?: string };
  /** Category chip: "Approach", "Putting". */
  category?: string;
  /** Short context line (header when no player, above the claim otherwise). */
  kicker?: React.ReactNode;
  /** One plain-language claim. Wrap the decisive phrase in <em> for green emphasis. */
  claim: React.ReactNode;
  /** The visual proof — StrokesGainedTornado, Numerics, Sparkline. */
  evidence?: React.ReactNode;
  /** Sample + source: "142 approach shots · Arccos". */
  source?: React.ReactNode;
  /** Primary next step. */
  action?: { label: string; onClick?: () => void };
  /** Quiet alternative: "Dismiss", "Snooze". */
  secondaryAction?: { label: string; onClick?: () => void };
  /** early = thin evidence: warning chip, muted claim, secondary action. */
  state?: 'default' | 'early';
  className?: string;
  style?: React.CSSProperties;
}
export declare function InsightCard(props: InsightCardProps): JSX.Element;
