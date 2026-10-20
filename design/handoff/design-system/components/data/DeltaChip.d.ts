export interface DeltaChipProps {
  /** Pre-formatted, signed: "+0.8", "−1.2". */
  value: React.ReactNode;
  /** Arrow direction (the number's sign). */
  direction?: 'up' | 'down' | 'flat';
  /** Is the change good? Decoupled from direction — fewer strokes is down AND positive. */
  tone?: 'positive' | 'negative' | 'neutral';
  className?: string;
}
export declare function DeltaChip(props: DeltaChipProps): JSX.Element;
