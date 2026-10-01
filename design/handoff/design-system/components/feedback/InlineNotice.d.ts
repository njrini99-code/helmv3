export interface InlineNoticeProps {
  tone?: 'info' | 'positive' | 'warning' | 'danger';
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** Usually a small ghost Button. */
  action?: React.ReactNode;
  className?: string;
}
export declare function InlineNotice(props: InlineNoticeProps): JSX.Element;
