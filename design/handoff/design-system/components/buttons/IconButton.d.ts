export interface IconButtonProps {
  /** Lucide name or node. */
  icon: string | React.ReactNode;
  /** Required accessible label (also the tooltip). */
  label: string;
  variant?: 'ghost' | 'secondary' | 'primary';
  size?: 'sm' | 'md' | 'lg';
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
