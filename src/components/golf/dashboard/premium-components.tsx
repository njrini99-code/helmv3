'use client';

/**
 * Premium Golf Dashboard Components
 *
 * Shared UI components for the golf dashboards: the shared framer-motion
 * stagger variants and the editorial SectionHeader.
 *
 * Usage:
 * ```tsx
 * import {
 *   SectionHeader,
 *   containerVariants,
 *   itemVariants
 * } from '@/components/golf/dashboard/premium-components';
 * ```
 *
 * Note: the former PremiumGlassCard surface is now the canonical
 * `<Card variant="raised">` from '@/components/ui/card' (Wave W2B).
 * PremiumStatCard, QuickActionCard, RoundRow, RecentRoundCard, and
 * TopPerformerRow were deleted in Wave W1 (2026-07-09) once Fairway became
 * the only dashboard tree — their only consumer, the legacy CoachDashboard,
 * was deleted alongside them.
 */

import { ReactNode } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconArrowRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
    DURATION,
    EASE_CINEMATIC,
    STAGGER_STEP,
} from '@/lib/coachhelm/v3/motion';

// ============================================================================
// ANIMATION VARIANTS — California-modern cinematic (slow, intentional)
//
// Bound to the canonical v3 motion library (`@/lib/coachhelm/v3/motion`)
// so the premium dashboard shell speaks the same motion vocabulary as
// every other v3 surface: one easing curve for entrances, one duration
// tier, one stagger step. No local ease constants, no magic numbers.
// ============================================================================

export const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            // Canonical 70ms stagger — sibling sections land as a wave,
            // not a stutter.
            staggerChildren: STAGGER_STEP,
            delayChildren: 0.02,
        },
    },
} as const;

export const itemVariants = {
    hidden: { opacity: 0, y: 14 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: DURATION.medium,
            ease: EASE_CINEMATIC as unknown as [number, number, number, number],
        },
    },
};

interface SectionHeaderProps {
    title: string;
    icon?: ReactNode;
    action?: { label: string; href: string };
    className?: string;
}

// Editorial section title — drops the all-caps tracking-wider chip
// in favor of a sculptural lowercase serif-adjacent sans. The label
// sits at body-size with -0.015em tracking; the eye reads it as a
// chapter break rather than a system label.
export function SectionHeader({
    title,
    icon,
    action,
    className
}: SectionHeaderProps) {
    return (
        <div className={cn('flex items-end justify-between mb-4 md:mb-5', className)}>
            <div className="flex items-center gap-2.5 min-w-0">
                {icon && <span className="text-primary-600 flex-shrink-0">{icon}</span>}
                <h2 className="text-body md:text-body-lg font-medium text-warm-700 tracking-[-0.012em] truncate">
                    {title}
                </h2>
            </div>
            {action && (
                <Button asChild variant="ghost" className="group flex-shrink-0 inline-flex items-center gap-1 min-h-[44px] px-2 -mx-2 rounded-lg text-body-sm font-medium text-warm-500 hover:text-primary-700 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                    <Link href={action.href} prefetch={true}>
                        {action.label}
                        <IconArrowRight
                            size={13}
                            className="transition-transform duration-300 group-hover:translate-x-0.5"
                        />
                    </Link>
                </Button>
            )}
        </div>
    );
}
