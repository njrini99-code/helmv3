export interface ViewHeaderProps {
  eyebrow?: React.ReactNode;
  /** Newsreader display title. */
  title: React.ReactNode;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  /** 32px title instead of 44px. */
  compact?: boolean;
  children?: React.ReactNode;
  className?: string;
}
export declare function ViewHeader(props: ViewHeaderProps): JSX.Element;
