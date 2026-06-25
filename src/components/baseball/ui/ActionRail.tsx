'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  IconPlus,
  IconDumbbell,
  IconNote,
  IconCalendar,
  IconMessage,
  IconBell,
  IconX,
} from '@/components/icons';
import type { BaseballCapabilityMap, BaseballCapability } from '@/lib/baseball/capabilities';

export type ActionRailAction =
  | 'create_task'
  | 'modify_lift'
  | 'add_note'
  | 'add_to_practice'
  | 'message'
  | 'add_followup'
  | 'dismiss';

export interface ActionRailProps {
  availableActions?: ActionRailAction[];
  onAction: (action: ActionRailAction) => void;
  isPending?: boolean;
  /**
   * Resolved capability map for the current caller. When provided, buttons
   * whose action requires a capability the caller does not hold are hidden.
   * Player-role callers supply an all-false map; this ensures coaching actions
   * (modify lift, practice, message) are invisible to non-staff callers.
   */
  capabilities?: BaseballCapabilityMap;
  className?: string;
}

interface ActionConfig {
  label: string;
  icon: React.ReactNode;
  /**
   * The capability required to see this action. When `capabilities` is passed
   * to ActionRail and the caller does not hold this capability, the button is
   * hidden. Actions without a `requiredCapability` are always shown.
   */
  requiredCapability?: BaseballCapability;
}

const ACTION_CONFIG: Record<ActionRailAction, ActionConfig> = {
  create_task: {
    label: 'Task',
    icon: <IconPlus size={15} />,
    requiredCapability: 'can_manage_practice',
  },
  modify_lift: {
    label: 'Modify Lift',
    icon: <IconDumbbell size={15} />,
    requiredCapability: 'can_manage_lifting',
  },
  add_note: {
    label: 'Note',
    icon: <IconNote size={15} />,
    // No capability required — all staff may add notes.
  },
  add_to_practice: {
    label: 'Practice',
    icon: <IconCalendar size={15} />,
    requiredCapability: 'can_manage_practice',
  },
  message: {
    label: 'Message',
    icon: <IconMessage size={15} />,
    requiredCapability: 'can_message_players',
  },
  add_followup: {
    label: 'Follow-up',
    icon: <IconBell size={15} />,
    // No capability required — any staff may schedule a follow-up.
  },
  dismiss: {
    label: 'Dismiss',
    icon: <IconX size={15} />,
    // No capability required — any viewer may dismiss a signal.
  },
};

const DEFAULT_ACTIONS: ActionRailAction[] = [
  'create_task',
  'modify_lift',
  'add_note',
  'add_to_practice',
  'message',
  'add_followup',
];

export function ActionRail({
  availableActions = DEFAULT_ACTIONS,
  onAction,
  isPending = false,
  capabilities,
  className,
}: ActionRailProps) {
  // Filter the requested action set by capability.
  const visibleActions = availableActions.filter((actionId) => {
    const { requiredCapability } = ACTION_CONFIG[actionId];
    if (!requiredCapability) return true;
    if (!capabilities) return true;
    return capabilities[requiredCapability] === true;
  });

  return (
    <div className={cn('flex flex-row flex-wrap gap-1', className)}>
      {visibleActions.map((actionId) => {
        const cfg = ACTION_CONFIG[actionId];
        return (
          <Button
            key={actionId}
            variant="ghost"
            size="sm"
            disabled={isPending}
            leftIcon={cfg.icon}
            onClick={() => onAction(actionId)}
            aria-label={cfg.label}
            className="min-h-[44px]"
          >
            {cfg.label}
          </Button>
        );
      })}
    </div>
  );
}
