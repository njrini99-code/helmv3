export interface EventCardProps {
  /** "Thursday · Qualifier" */
  kicker?: React.ReactNode;
  /** Pill on the right: "In 2 days". */
  countdown?: React.ReactNode;
  title: React.ReactNode;
  /** Icon + label facts: [{icon:'map-pin', label:'Pinehurst, NC'}]. */
  meta?: Array<{ icon?: string; label: React.ReactNode }>;
  /** Tee times / agenda rows. people = names for the avatar stack. */
  rows?: Array<{ time: string; label: React.ReactNode; people?: string[] }>;
  /** Buttons; primary renders ivory, secondary translucent on the green. */
  actions?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function EventCard(props: EventCardProps): JSX.Element;
