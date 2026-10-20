export interface SelectOption { value: string; label: string }
export interface SelectProps {
  options: Array<SelectOption | string>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}
export declare function Select(props: SelectProps): JSX.Element;
