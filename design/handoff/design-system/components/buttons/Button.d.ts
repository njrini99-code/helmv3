export interface ButtonProps {
  /** primary = Augusta green (one per view). secondary = white + hairline (default). ghost = quiet text. ink = warm-black fill for a decisive neutral action (sign, confirm). danger = red text on white. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'ink' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Shows spinner, keeps label, blocks clicks. */
  busy?: boolean;
  fullWidth?: boolean;
  /** Lucide name or node. */
  leftIcon?: string | React.ReactNode;
  rightIcon?: string | React.ReactNode;
  /** Keyboard shortcut hint shown as a keycap after the label: "N", "⌘K". */
  kbd?: string;
  disabled?: boolean;
  /** Renders an <a> instead of a <button>. */
  href?: string;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  className?: string;
}
export declare function Button(props: ButtonProps): JSX.Element;
