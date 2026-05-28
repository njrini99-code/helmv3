'use client';

/**
 * Premium Golf Dashboard Components
 * 
 * These are the shared premium UI components used across the golf dashboards.
 * They implement the glassmorphism design system with framer-motion animations.
 * 
 * Usage:
 * ```tsx
 * import { 
 *   PremiumGlassCard, 
 *   PremiumStatCard, 
 *   QuickActionCard, 
 *   SectionHeader 
 * } from '@/components/golf/dashboard/premium-components';
 * ```
 */

import { ReactNode, memo, useState, useEffect } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconArrowRight, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';
import { IOS_DURATION_NORMAL, IOS_EASE } from '@/lib/ios-animations';
import {
    DURATION,
    EASE_CINEMATIC,
    EASE_TAP,
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

// Re-export so existing iOS imports keep working
void IOS_DURATION_NORMAL;
void IOS_EASE;

// ============================================================================
// PREMIUM GLASS CARD
// ============================================================================

interface PremiumGlassCardProps {
    children: ReactNode;
    className?: string;
    glow?: boolean;
    noPadding?: boolean;
    hover?: boolean;
}

// PremiumGlassCard now reads as a sculpted matte panel rather than a
// glassy tile. Generous default padding (p-6 md:p-7), 24px corners,
// diffused natural-light shadow, slow cinematic hover lift. The
// "glow" prop fades a soft sage glow rather than the older saturated
// blue/green stack — keeps the eye on the content.
export const PremiumGlassCard = memo(function PremiumGlassCard({
    children,
    className,
    glow = false,
    noPadding = false,
    hover = true
}: PremiumGlassCardProps) {
    const Component = hover ? m.div : 'div';
    const hoverProps = hover ? {
        whileHover: { y: -2 },
        transition: { duration: DURATION.short, ease: EASE_TAP as unknown as [number, number, number, number] }
    } : {};

    return (
        <Component
            className={cn(
                'relative overflow-clip',
                'surface-matte',
                'rounded-3xl',
                'transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                !noPadding && 'p-6 md:p-7',
                className
            )}
            {...hoverProps}
        >
            {/* Soft natural-light glow — diffused, never flashy */}
            {glow && (
                <>
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -top-20 -right-16 w-56 h-56 rounded-full opacity-70"
                        style={{ background: 'radial-gradient(closest-side, rgba(22,163,74,0.10), transparent 70%)' }}
                    />
                    <div
                        aria-hidden
                        className="pointer-events-none absolute -bottom-16 -left-16 w-48 h-48 rounded-full opacity-60"
                        style={{ background: 'radial-gradient(closest-side, rgba(180,83,9,0.06), transparent 70%)' }}
                    />
                </>
            )}
            {/* Content */}
            <div className="relative z-10">{children}</div>
        </Component>
    );
});

// ============================================================================
// PREMIUM STAT CARD
// ============================================================================

interface PremiumStatCardProps {
    icon: ReactNode;
    iconColor: string;
    iconBg: string;
    label: string;
    value: string | number;
    subValue?: string;
    trend?: { value: number; positive: boolean } | null;
    href?: string;
    accent?: boolean;
    ariaLabel?: string;
}

export const PremiumStatCard = memo(function PremiumStatCard({
    icon,
    iconColor,
    iconBg,
    label,
    value,
    subValue,
    trend,
    href,
    accent = false,
    ariaLabel
}: PremiumStatCardProps) {
    const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
    const isNumeric = !isNaN(numericValue);
    const accessibleLabel = ariaLabel || `${label}: ${value}${trend ? `, ${trend.positive ? 'up' : 'down'} ${Math.abs(trend.value)}` : ''}`;

    const CardContent = (
        <m.div
            role={href ? "link" : "region"}
            aria-label={accessibleLabel}
            className={cn(
                'relative overflow-clip group cursor-pointer',
                'surface-matte rounded-3xl p-6',
                'transition-shadow duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]',
                accent && 'before:absolute before:inset-y-6 before:left-0 before:w-[2px] before:bg-primary-500/70 before:rounded-r-full'
            )}
            whileHover={{ y: -2 }}
            transition={{ duration: DURATION.short, ease: EASE_TAP as unknown as [number, number, number, number] }}
        >
            <div className="relative flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-warm-500 mb-1.5 tracking-wide uppercase opacity-80">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-[32px] md:text-[36px] font-light leading-none tracking-[-0.025em] text-warm-900 tabular-nums" suppressHydrationWarning>
                            {isNumeric ? numericValue.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value}
                        </p>
                        {trend && (
                            <span className={cn(
                                'inline-flex items-center gap-0.5 text-[11px] font-medium tabular-nums',
                                trend.positive ? 'text-primary-600' : 'text-red-500'
                            )}>
                                {trend.positive ? <IconTrendingUp size={11} /> : <IconTrendingDown size={11} />}
                                {Math.abs(trend.value).toFixed(1)}
                            </span>
                        )}
                    </div>
                    {subValue && (
                        <p className="text-[12px] text-warm-400 mt-1.5">{subValue}</p>
                    )}
                </div>
                <div className={cn(
                    'w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105',
                    iconBg, iconColor
                )}>
                    {icon}
                </div>
            </div>

            {href && (
                <div className="absolute bottom-5 right-5 opacity-0 md:group-hover:opacity-100 transition-opacity duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                    <IconArrowRight size={14} className="text-primary-500" />
                </div>
            )}
        </m.div>
    );

    if (href) {
        return <Link href={href} prefetch={true}>{CardContent}</Link>;
    }
    return CardContent;
});

// ============================================================================
// QUICK ACTION CARD
// ============================================================================

interface QuickActionCardProps {
    icon: ReactNode;
    label: string;
    description?: string;
    href: string;
    variant?: 'default' | 'primary';
}

export const QuickActionCard = memo(function QuickActionCard({
    icon,
    label,
    description,
    href,
    variant = 'default'
}: QuickActionCardProps) {
    return (
        <Link href={href} prefetch={true} aria-label={`${label}${description ? `: ${description}` : ''}`}>
            <m.div
                className={cn(
                    'group flex items-center gap-4 p-4 rounded-2xl cursor-pointer', // Standardized: 16px
                    'transition-colors duration-200 touch-manipulation hover:shadow-card-hover',
                    'min-h-[56px]', // Ensure minimum touch target height
                    variant === 'primary'
                        ? [
                            'bg-gradient-to-r from-warm-900 to-warm-800',
                            'border border-warm-700/50',
                            'shadow-[0_4px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]'
                        ]
                        : [
                            'bg-glass-subtle backdrop-blur-glass', // Standard glass
                            'border border-warm-200/45',
                            ''
                        ]
                )}
                whileHover={{
                    y: -2,
                    scale: 1.01,
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', // Standardized: 12px
                    'transition-transform duration-200 group-hover:scale-105',
                    variant === 'primary'
                        ? 'bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                        : 'bg-warm-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                )}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={cn(
                        'font-medium text-base', // Standardized: 16px
                        variant === 'primary' ? 'text-white' : 'text-warm-900'
                    )}>
                        {label}
                    </p>
                    {description && (
                        <p className={cn(
                            'text-xs mt-0.5',
                            variant === 'primary' ? 'text-white/60' : 'text-warm-500'
                        )}>
                            {description}
                        </p>
                    )}
                </div>
                <IconArrowRight
                    size={16}
                    className={cn(
                        'flex-shrink-0 opacity-100 translate-x-0 md:opacity-0 md:-translate-x-2 md:group-hover:opacity-100 md:group-hover:translate-x-0 transition-[opacity,transform]',
                        variant === 'primary' ? 'text-white/60' : 'text-primary-500'
                    )}
                />
            </m.div>
        </Link>
    );
});

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
                <h2 className="text-[15px] md:text-[17px] font-medium text-warm-700 tracking-[-0.012em] truncate">
                    {title}
                </h2>
            </div>
            {action && (
                <Link href={action.href} prefetch={true} className="flex-shrink-0">
                    <button className="group inline-flex items-center gap-1 min-h-[44px] px-2 -mx-2 rounded-lg text-[13px] font-medium text-warm-500 hover:text-primary-700 transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                        {action.label}
                        <IconArrowRight
                            size={13}
                            className="transition-transform duration-300 group-hover:translate-x-0.5"
                        />
                    </button>
                </Link>
            )}
        </div>
    );
}

// ============================================================================
// ROUND ROW (Legacy — kept for backward compat with player dashboard)
// ============================================================================

interface RoundRowProps {
    id?: string;
    playerName?: string;
    courseName: string;
    score: number;
    toPar: number;
    date: string;
    showPlayer?: boolean;
}

export function RoundRow({
    id,
    playerName,
    courseName,
    score,
    toPar,
    date,
    showPlayer = true
}: RoundRowProps) {
    const toParLabel = toPar === 0 ? 'even' : toPar > 0 ? `${toPar} over par` : `${Math.abs(toPar)} under par`;
    const accessibleLabel = showPlayer && playerName
        ? `${playerName} scored ${score} (${toParLabel}) at ${courseName}`
        : `Score ${score} (${toParLabel}) at ${courseName}`;

    const content = (
        <m.div
            role={id ? undefined : "button"}
            tabIndex={id ? undefined : 0}
            aria-label={accessibleLabel}
            className="group flex items-center gap-4 px-5 py-4 md:px-6 hover:bg-cream-50/55 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-400/30"
            whileHover={{ x: 3 }}
        >
            <div className={cn(
                'w-12 h-12 rounded-2xl flex flex-col items-center justify-center flex-shrink-0',
                toPar < 0 ? 'bg-primary-50/75' :
                toPar === 0 ? 'bg-warm-100/65' :
                'bg-amber-50/70'
            )}>
                <span className={cn(
                    'text-[16px] font-medium tabular-nums leading-none tracking-[-0.012em]',
                    toPar < 0 ? 'text-primary-700' : toPar === 0 ? 'text-warm-700' : 'text-amber-700'
                )}>
                    {score}
                </span>
                <span className={cn(
                    'text-[10px] font-medium mt-0.5',
                    toPar < 0 ? 'text-primary-500' : toPar === 0 ? 'text-warm-400' : 'text-amber-500'
                )}>
                    {toPar > 0 ? '+' : ''}{toPar}
                </span>
            </div>
            <div className="flex-1 min-w-0">
                {showPlayer && playerName && (
                    <p className="font-medium text-[15px] text-warm-900 tracking-[-0.005em] truncate">{playerName}</p>
                )}
                <p className={cn(
                    'truncate',
                    showPlayer ? 'text-[13px] text-warm-500' : 'font-medium text-[15px] text-warm-900 tracking-[-0.005em]'
                )}>
                    {courseName}
                </p>
                <p className="text-[12px] text-warm-400 mt-0.5" suppressHydrationWarning>
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
            </div>
            <div className="flex-shrink-0 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                <IconArrowRight size={14} className="text-primary-500" />
            </div>
        </m.div>
    );

    if (id) {
        return <Link href={`/golf/dashboard/rounds/${id}`} prefetch={false}>{content}</Link>;
    }
    return content;
}

// ============================================================================
// RECENT ROUND CARD (Premium — Coach Dashboard)
// ============================================================================

function formatRelativeDate(dateStr: string, now?: Date | null): string {
    const date = new Date(dateStr);
    if (!now) return '';
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatRoundType(type: string | null): string {
    if (!type) return 'Round';
    const map: Record<string, string> = {
        practice: 'Practice',
        tournament: 'Tournament',
        qualifier: 'Qualifier',
        casual: 'Casual',
        match: 'Match Play',
    };
    return map[type] || type.charAt(0).toUpperCase() + type.slice(1);
}

interface RecentRoundCardProps {
    id: string;
    playerId: string;
    playerName: string;
    playerAvatarUrl: string | null;
    courseName: string;
    score: number;
    toPar: number;
    date: string;
    roundType: string | null;
    totalPutts: number | null;
    totalFairwaysHit: number | null;
    totalFairways: number | null;
    totalGir: number | null;
    totalGirPossible: number | null;
}

export const RecentRoundCard = memo(function RecentRoundCard({
    id,
    playerName,
    playerAvatarUrl,
    courseName,
    score,
    toPar,
    date,
    roundType,
    totalPutts,
    totalFairwaysHit,
    totalFairways,
    totalGir,
    totalGirPossible,
}: RecentRoundCardProps) {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => { setNow(new Date()); }, []);
    const toParLabel = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
    const accessibleLabel = `${playerName} scored ${score} (${toParLabel}) at ${courseName}`;

    // Calculate percentages for stat pills
    const firPct = totalFairwaysHit !== null && totalFairways && totalFairways > 0
        ? Math.round((totalFairwaysHit / totalFairways) * 100)
        : null;
    const girPct = totalGir !== null && totalGirPossible && totalGirPossible > 0
        ? Math.round((totalGir / totalGirPossible) * 100)
        : null;

    const hasStats = totalPutts !== null || firPct !== null || girPct !== null;

    return (
        <Link href={`/golf/dashboard/rounds/${id}`} prefetch={false}>
            <m.div
                role="article"
                aria-label={accessibleLabel}
                className={cn(
                    'group relative px-5 py-5 md:px-6',
                    'hover:bg-cream-50/55 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer',
                    'focus-within:ring-1 focus-within:ring-primary-400/30'
                )}
                whileHover={{ x: 3 }}
                transition={{ duration: DURATION.short, ease: EASE_TAP as unknown as [number, number, number, number] }}
            >
                <div className="flex items-start gap-4">
                    {/* Player Avatar */}
                    <div className="flex-shrink-0 mt-0.5">
                        <Avatar
                            src={playerAvatarUrl}
                            name={playerName}
                            size="sm"
                        />
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                        {/* Top row: Player name + relative date */}
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <p className="font-medium text-[15px] text-warm-900 tracking-[-0.005em] truncate">
                                {playerName}
                            </p>
                            <span className="text-[12px] text-warm-400 flex-shrink-0 tabular-nums" suppressHydrationWarning>
                                {formatRelativeDate(date, now)}
                            </span>
                        </div>

                        {/* Course name + round type */}
                        <div className="flex items-center gap-2 mb-3">
                            <p className="text-[13px] text-warm-500 truncate">
                                {courseName}
                            </p>
                            {roundType && (
                                <>
                                    <span className="text-warm-300 flex-shrink-0" aria-hidden>&middot;</span>
                                    <span className="text-[12px] text-warm-400 flex-shrink-0">
                                        {formatRoundType(roundType)}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Score badge + Stat pills row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Score badge — soft pill, no border, no inset highlight */}
                            <div className={cn(
                                'inline-flex items-center gap-2 px-3 py-1.5 rounded-full',
                                toPar < 0 ? 'bg-primary-50/70' :
                                toPar === 0 ? 'bg-warm-100/70' :
                                'bg-amber-50/70'
                            )}>
                                <span className={cn(
                                    'text-[15px] font-medium tabular-nums leading-none tracking-[-0.01em]',
                                    toPar < 0 ? 'text-primary-700' : toPar === 0 ? 'text-warm-700' : 'text-amber-700'
                                )}>
                                    {score}
                                </span>
                                <span className={cn(
                                    'text-[11px] font-medium tabular-nums leading-none',
                                    toPar < 0 ? 'text-primary-500' : toPar === 0 ? 'text-warm-400' : 'text-amber-500'
                                )}>
                                    {toParLabel}
                                </span>
                            </div>

                            {/* Stat pills — minimal, no fill, just text */}
                            {hasStats && (
                                <div className="flex items-center gap-3 text-[12px] text-warm-500">
                                    {totalPutts !== null && (
                                        <span className="tabular-nums">{totalPutts} putts</span>
                                    )}
                                    {firPct !== null && (
                                        <span className="hidden sm:inline tabular-nums">FIR {firPct}%</span>
                                    )}
                                    {girPct !== null && (
                                        <span className="hidden sm:inline tabular-nums">GIR {girPct}%</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className="flex-shrink-0 mt-2 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]">
                        <IconArrowRight size={14} className="text-primary-500" />
                    </div>
                </div>
            </m.div>
        </Link>
    );
});

// ============================================================================
// TOP PERFORMER ROW
// ============================================================================

interface TopPerformerRowProps {
    rank: number;
    name: string;
    avgScore: number;
    rounds: number;
}

export function TopPerformerRow({
    rank,
    name,
    avgScore,
    rounds
}: TopPerformerRowProps) {
    const rankColors: Record<number, { bg: string; text: string; icon?: string }> = {
        1: { bg: 'bg-gradient-to-br from-amber-100 to-amber-200', text: 'text-amber-700', icon: '🥇' },
        2: { bg: 'bg-warm-100/65', text: 'text-warm-600', icon: '🥈' },
        3: { bg: 'bg-gradient-to-br from-orange-100 to-orange-200', text: 'text-orange-600', icon: '🥉' }
    };

    const colors = rankColors[rank] || { bg: 'bg-warm-100/65', text: 'text-warm-500' };
    const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;

    return (
        <m.div
            role="listitem"
            aria-label={`${rankLabel} place: ${name}, average score ${avgScore.toFixed(1)} over ${rounds} rounds`}
            className="flex items-center gap-4 px-5 py-4 md:px-6 hover:bg-cream-50/55 transition-colors duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-primary-400/30"
            whileHover={{ x: 3 }}
            tabIndex={0}
        >
            <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-medium tabular-nums',
                colors.bg, colors.text
            )}>
                {colors.icon || rank}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-medium text-[15px] text-warm-900 tracking-[-0.005em] truncate">{name}</p>
                <p className="text-[12px] text-warm-500">{rounds} rounds</p>
            </div>
            <div className="text-right">
                <p className="font-medium text-warm-900 tabular-nums text-[17px] tracking-[-0.012em]">{avgScore.toFixed(1)}</p>
                <p className="text-[11px] text-warm-400 tracking-wide">avg</p>
            </div>
        </m.div>
    );
}
