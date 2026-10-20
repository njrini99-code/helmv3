export interface FieldRow { label: string; you: number; team: number; tour: number; unit?: string; /** Direction that is better. Putts per round: "down". */ better?: 'up' | 'down' }
export interface FieldTableProps {
  rows: FieldRow[];
  title?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function FieldTable(props: FieldTableProps): JSX.Element;
