export interface InputProps {
  /** Lucide name. */
  leftIcon?: string;
  /** Unit or hint, set in mono: "yds", "%". */
  suffix?: React.ReactNode;
  size?: 'md' | 'lg';
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  type?: string;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Input(props: InputProps): JSX.Element;
