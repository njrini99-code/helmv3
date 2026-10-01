export interface ToastItem {
  id: string | number;
  title: React.ReactNode;
  /** Lucide name. */
  icon?: string;
  action?: { label: string; onClick?: () => void };
}
export interface ToastStackProps {
  toasts: ToastItem[];
  onDismiss?: (id: string | number) => void;
  /** Render in flow (for specimens) instead of fixed bottom-right. */
  inline?: boolean;
}
export declare function ToastStack(props: ToastStackProps): JSX.Element;
