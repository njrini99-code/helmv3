export interface ModalShellProps {
  open?: boolean;
  onClose?: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Lucide name in a green tile beside the title. */
  icon?: string;
  /** Left side of the footer: draft status, helper text. */
  note?: React.ReactNode;
  children?: React.ReactNode;
  /** Right-aligned actions; primary last. */
  footer?: React.ReactNode;
  width?: number;
  /** Position within the nearest positioned parent (specimens, previews). */
  inline?: boolean;
}
export declare function ModalShell(props: ModalShellProps): JSX.Element;
