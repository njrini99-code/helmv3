export interface AvatarProps {
  name?: string;
  /** Overrides derived initials. */
  initials?: string;
  src?: string;
  /** px. 24 dense rows, 32 default, 44 headers, 72 profile masthead. */
  size?: number;
  /** Thin brass ring — use for the focused person on a page. */
  ring?: boolean;
  /** Calm monogram fill; derived from the name when omitted. */
  tone?: 'sand' | 'stone' | 'sage' | 'mist' | 'clay';
  className?: string;
}
export declare function Avatar(props: AvatarProps): JSX.Element;
