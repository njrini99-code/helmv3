'use client';

import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  IconChevronRight,
  IconTarget,
  IconCrosshair,
  IconFlag,
  IconCircleDot,
  IconMap,
  IconBrain,
  IconTrophy,
  IconWind,
  IconDumbbell,
  IconClipboardList,
} from '@/components/icons';
import type { ComponentType } from 'react';
import type { PlayerFocusArea, FocusAreaIconName } from '@/lib/coachhelm/insight-types';
import { getFocusAreaConfig } from '@/lib/coachhelm/insight-types';

const FOCUS_AREA_ICON_MAP: Record<FocusAreaIconName, ComponentType<{ size?: number; className?: string }>> = {
  crosshair: IconCrosshair,
  flag: IconFlag,
  'circle-dot': IconCircleDot,
  map: IconMap,
  brain: IconBrain,
  trophy: IconTrophy,
  target: IconTarget,
  wind: IconWind,
  dumbbell: IconDumbbell,
  'clipboard-list': IconClipboardList,
};

interface FocusAreaCardProps {
  focusArea: PlayerFocusArea;
  onClick?: () => void;
}

export function FocusAreaCard({ focusArea, onClick }: FocusAreaCardProps) {
  // DB rows use `area_type`; `category` was the client-side name. Accept both
  // so we don't crash on rows that only ship `area_type`.
  const areaKey = focusArea.category ?? (focusArea as unknown as { area_type?: string }).area_type;
  const config = getFocusAreaConfig(areaKey);
  const AreaIcon = FOCUS_AREA_ICON_MAP[config.icon] ?? IconTarget;

  return (
    <Card variant="overlay"
      className={cn(
        'group transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        onClick && 'cursor-pointer hover:-translate-y-[1px] hover:shadow-[0_2px_4px_rgba(58,50,40,0.04),0_18px_36px_rgba(58,50,40,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2'
      )}
      padding="md"
      onClick={onClick}
      // Keyboard-operable when clickable — a bare onClick div is a mouse-only
      // trap otherwise (WCAG 2.1.1). Card renders a plain div, so the role/
      // tabIndex/onKeyDown are added here, not in the shared primitive.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            'w-8 h-8 rounded-2xl flex items-center justify-center text-body-sm font-medium tabular-nums flex-shrink-0',
            focusArea.priority === 1 && 'bg-primary-100/80 text-primary-700',
            focusArea.priority === 2 && 'bg-primary-50/80 text-primary-600',
            focusArea.priority === 3 && 'bg-warm-100/70 text-warm-700',
            focusArea.priority === 4 && 'bg-warm-50/65 text-warm-500',
            focusArea.priority === 5 && 'bg-warm-50/60 text-warm-400'
          )}
        >
          {focusArea.priority}
        </div>

        <div className="w-9 h-9 rounded-2xl bg-primary-50/65 text-primary-700 flex items-center justify-center flex-shrink-0">
          <AreaIcon size={17} />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-warm-900 text-body tracking-[-0.005em] mb-1">
            {focusArea.title}
          </h4>
          <p className="text-body-sm text-warm-600 leading-relaxed line-clamp-2">
            {focusArea.description}
          </p>

          {focusArea.target_improvement ? (
            <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 bg-primary-50/65 text-primary-700 text-caption font-medium rounded-full">
              <IconTarget size={11} className="text-primary-600" />
              {focusArea.target_improvement}
            </div>
          ) : onClick ? (
            // Bug #58/#75 parity: this read-only card used to leave a focus
            // area with no target as a dead placeholder-less gap (no visible
            // affordance at all), so a player just saw a description with
            // nothing to do next — and every such row stayed that way
            // indefinitely since there was no way to act on it here. Give it
            // a real, tappable CTA wired to the SAME handler the whole card
            // already uses (My Development is where a target actually gets
            // set), gated on `onClick` being wired so it's never a dead
            // button. `stopPropagation` avoids double-firing the parent
            // card's own onClick.
            <Button
              variant="ghost"
              size="sm"
              leftIcon={<IconTarget size={11} />}
              className="mt-2.5 h-auto min-h-0 rounded-full border border-dashed border-warm-300 bg-transparent px-3 py-1 text-caption font-medium text-warm-600 hover:border-primary-400 hover:bg-primary-50/50 hover:text-primary-700"
              onClick={(e) => {
                e.stopPropagation();
                onClick();
              }}
            >
              Set a target
            </Button>
          ) : null}

          {focusArea.specific_drills && focusArea.specific_drills.length > 0 && (
            <p className="text-caption text-warm-400 mt-2">
              {focusArea.specific_drills.length} recommended drill{focusArea.specific_drills.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        {onClick && (
          <IconChevronRight
            size={15}
            className="text-warm-300 group-hover:text-primary-500 transition-colors duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] flex-shrink-0 mt-1"
          />
        )}
      </div>
    </Card>
  );
}
