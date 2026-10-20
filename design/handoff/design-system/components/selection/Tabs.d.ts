export interface TabItem { value: string; label: React.ReactNode; count?: number }
export interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange?: (value: string) => void;
  className?: string;
}
export declare function Tabs(props: TabsProps): JSX.Element;
