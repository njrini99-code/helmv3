export interface TextAreaProps {
  rows?: number;
  invalid?: boolean;
  id?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  className?: string;
}
export declare function TextArea(props: TextAreaProps): JSX.Element;
