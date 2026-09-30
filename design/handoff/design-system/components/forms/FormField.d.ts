export interface FormFieldProps {
  label?: React.ReactNode;
  htmlFor?: string;
  optional?: boolean;
  help?: React.ReactNode;
  /** Replaces help text; message row height is reserved so layout never jumps. */
  error?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}
export declare function FormField(props: FormFieldProps): JSX.Element;
