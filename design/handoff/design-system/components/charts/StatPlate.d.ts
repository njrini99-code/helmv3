export interface StatPlateProps {
  /** Short condensed label in the green tab: "Greens in reg." */
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  /** Pre-formatted change: "−1.3". */
  delta?: React.ReactNode;
  /** Is the change good? Green if so, amber if not. */
  good?: boolean;
  className?: string;
  style?: React.CSSProperties;
}
export declare function StatPlate(props: StatPlateProps): JSX.Element;
