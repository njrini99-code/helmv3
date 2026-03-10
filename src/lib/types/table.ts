import type { ElementType } from 'react';

/** A single action in a RowActionsMenu. */
export interface RowAction {
  label: string;
  onClick: () => void;
  icon?: ElementType<{ className?: string }>;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}
