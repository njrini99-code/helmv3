'use client';

/**
 * OptionCard — a pressable, staggered-reveal choice tile for the
 * coach-onboarding wizard (coach type, lifting-coach yes/no). Built from the
 * Living Annual interaction layer (`Reveal` + `pressableClass`, spec §7)
 * instead of the generic `Button variant="ghost"` + hand-rolled hover classes
 * the legacy wizard used — same press-down + lane-ink hover tint every other
 * redesigned baseball surface uses, staggered in behind its siblings.
 */
import type { ComponentType } from 'react';
import { Reveal, pressableClass } from '@/components/baseball/living-annual';
import { IconArrowRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface OptionCardProps {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
  staggerIndex?: number;
  className?: string;
}

export function OptionCard({
  icon: Icon,
  title,
  description,
  onClick,
  disabled = false,
  staggerIndex = 0,
  className,
}: OptionCardProps) {
  return (
    <Reveal staggerIndex={staggerIndex}>
      <Button
        variant="ghost"
        onClick={onClick}
        disabled={disabled}
        className={cn(
          'group w-full rounded-2xl border border-[color:var(--hairline)] bg-[var(--paper)] p-5 text-left',
          'shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,0,0,0.05)]',
          'h-auto min-h-0 justify-start hover:bg-[var(--paper)]',
          pressableClass({ ink: 'team', lift: true }),
          className,
        )}
      >
        <div className="flex w-full items-center gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-fw-sm border border-[color:var(--hairline)] bg-[var(--paper-canvas)] text-grade-plus transition-transform duration-200 [@media(hover:hover)]:group-hover:scale-105">
            <Icon size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-annual text-lg font-medium leading-tight text-text-primary">{title}</p>
            <p className="mt-0.5 text-sm text-text-tertiary">{description}</p>
          </div>
          <IconArrowRight
            size={16}
            className="ml-auto flex-shrink-0 text-text-tertiary transition-colors [@media(hover:hover)]:group-hover:text-grade-plus"
          />
        </div>
      </Button>
    </Reveal>
  );
}
