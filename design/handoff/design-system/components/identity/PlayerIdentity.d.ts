export interface PlayerIdentityProps {
  name: string;
  /** e.g. "Junior · HCP 2.4" */
  meta?: React.ReactNode;
  initials?: string;
  src?: string;
  /** lg uses the serif display name — for profile mastheads. */
  size?: 'sm' | 'md' | 'lg';
  ring?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}
export declare function PlayerIdentity(props: PlayerIdentityProps): JSX.Element;
