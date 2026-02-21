'use client';

import { memo, useCallback, type ReactNode, type MouseEvent } from 'react';
import { usePeekPanelStore, type PeekPanelType } from '@/stores/peek-panel-store';
import { cn } from '@/lib/utils';

interface PeekPanelTriggerProps {
  /**
   * The type of panel to open
   */
  type: NonNullable<PeekPanelType>;
  /**
   * The ID of the entity to display (player ID, school ID, etc.)
   */
  id: string;
  /**
   * Child elements - the trigger content
   */
  children: ReactNode;
  /**
   * Additional class names for the wrapper
   */
  className?: string;
  /**
   * Whether to prevent the default click behavior
   * @default true
   */
  preventDefault?: boolean;
  /**
   * Whether to stop event propagation
   * @default true
   */
  stopPropagation?: boolean;
  /**
   * Optional callback when the panel is opened
   */
  onOpen?: () => void;
  /**
   * Whether the trigger is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * Element type to render (div, span, etc.)
   * @default 'div'
   */
  as?: 'div' | 'span' | 'button';
}

/**
 * A wrapper component that opens a peek panel when clicked.
 * Use this to wrap any element that should trigger a peek panel.
 *
 * @example
 * ```tsx
 * // Wrap a player card
 * <PeekPanelTrigger type="player" id={player.id}>
 *   <PlayerCard player={player} />
 * </PeekPanelTrigger>
 *
 * // Wrap a table row
 * <PeekPanelTrigger type="player" id={player.id} as="span">
 *   {player.name}
 * </PeekPanelTrigger>
 * ```
 */
const PeekPanelTriggerComponent = function PeekPanelTrigger({
  type,
  id,
  children,
  className,
  preventDefault = true,
  stopPropagation = true,
  onOpen,
  disabled = false,
  as: Component = 'div',
}: PeekPanelTriggerProps) {
  const { openPlayerPanel, openSchoolPanel } = usePeekPanelStore();

  const handleClick = useCallback(
    (e: MouseEvent) => {
      if (disabled) return;

      if (preventDefault) {
        e.preventDefault();
      }
      if (stopPropagation) {
        e.stopPropagation();
      }

      switch (type) {
        case 'player':
          openPlayerPanel(id);
          break;
        case 'school':
          openSchoolPanel(id);
          break;
      }

      onOpen?.();
    },
    [type, id, disabled, preventDefault, stopPropagation, openPlayerPanel, openSchoolPanel, onOpen]
  );

  return (
    <Component
      onClick={handleClick}
      className={cn(
        'cursor-pointer',
        disabled && 'cursor-default pointer-events-none',
        className
      )}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          handleClick(e as unknown as MouseEvent);
        }
      }}
      aria-disabled={disabled}
    >
      {children}
    </Component>
  );
};

export const PeekPanelTrigger = memo(PeekPanelTriggerComponent);
PeekPanelTrigger.displayName = 'PeekPanelTrigger';
