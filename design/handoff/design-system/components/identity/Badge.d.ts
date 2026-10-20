export interface BadgeProps {
  /** neutral (default) · outline · accent (green) · positive · warning · danger · info · ink (solid, e.g. "Leader"). */
  tone?: 'neutral' | 'outline' | 'accent' | 'positive' | 'warning' | 'danger' | 'info' | 'ink';
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}
export declare function Badge(props: BadgeProps): JSX.Element;
