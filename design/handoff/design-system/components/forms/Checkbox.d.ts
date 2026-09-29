export interface CheckboxProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  className?: string;
}
export declare function Checkbox(props: CheckboxProps): JSX.Element;
