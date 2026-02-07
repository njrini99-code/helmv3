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

import { ReactNode, memo } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconArrowRight, IconTrendingUp, IconTrendingDown } from '@/components/icons';
import { Avatar } from '@/components/ui/avatar';

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

export const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.05,
            delayChildren: 0
        }
    }
} as const;

export const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.35,
            ease: [0.16, 1, 0.3, 1] as [number, number, number, number]
        }
    }
};

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

// OPTIMIZATION: Memoize to prevent unnecessary re-renders
export const PremiumGlassCard = memo(function PremiumGlassCard({
    children,
    className,
    glow = false,
    noPadding = false,
    hover = true
}: PremiumGlassCardProps) {
    const Component = hover ? motion.div : 'div';
    const hoverProps = hover ? {
        whileHover: {
            boxShadow: '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.03), 0 16px 32px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)'
        },
        transition: { type: 'spring' as const, stiffness: 400, damping: 30 }
    } : {};

    return (
        <Component
            className={cn(
                'relative overflow-hidden',
                // Enhanced Premium Glass - More transparent and glass-like
                'bg-glass-subtle backdrop-blur-glass-prominent',
                'border border-white/30',
                'rounded-2xl', // Standardized: 16px
                // Premium shadow with inset highlight
                'shadow-glass-md',
                !noPadding && 'p-5',
                className
            )}
            {...hoverProps}
        >
            {/* Enhanced ambient glow */}
            {glow && (
                <>
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-primary-500/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-blue-500/8 rounded-full blur-2xl pointer-events-none" />
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
        <motion.div
            role={href ? "link" : "region"}
            aria-label={accessibleLabel}
            className={cn(
                // Enhanced Premium glass effect - More transparent
                "relative overflow-hidden group cursor-pointer",
                "bg-glass-subtle backdrop-blur-glass-prominent",
                "border rounded-2xl", // Standardized: 16px
                "p-5",
                // Premium multi-layer shadow with inset highlight
                "shadow-glass-md",
                // Accent border
                accent
                    ? "border-l-[3px] border-l-primary-600 border-t-white/30 border-r-white/30 border-b-white/30"
                    : "border-white/30"
            )}
            whileHover={{
                y: -4,
                scale: 1.02,
                boxShadow: '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.03), 0 16px 32px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)'
            }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
        >
            {/* Subtle inner gradient for depth */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent pointer-events-none rounded-2xl" />

            {/* Hover glow effect */}
            <div className="absolute -inset-1 bg-primary-500/0 group-hover:bg-primary-500/5 rounded-2xl transition-colors duration-300 pointer-events-none" />

            <div className="relative flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-500 mb-1">{label}</p>
                    <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-bold tracking-tight text-slate-900 tabular-nums">
                            {isNumeric ? numericValue.toLocaleString(undefined, { maximumFractionDigits: 1 }) : value}
                        </p>
                        {trend && (
                            <span className={cn(
                                'flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full',
                                trend.positive
                                    ? 'text-primary-700 bg-primary-50'
                                    : 'text-red-600 bg-red-50'
                            )}>
                                {trend.positive ? <IconTrendingUp size={12} /> : <IconTrendingDown size={12} />}
                                {Math.abs(trend.value).toFixed(1)}
                            </span>
                        )}
                    </div>
                    {subValue && (
                        <p className="text-xs text-slate-400 mt-1">{subValue}</p>
                    )}
                </div>
                <div className={cn(
                    'w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0', // Standardized: 12px
                    'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
                    'group-hover:scale-105 transition-transform duration-200',
                    iconBg, iconColor
                )}>
                    {icon}
                </div>
            </div>

            {href && (
                <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <IconArrowRight size={14} className="text-primary-500" />
                </div>
            )}
        </motion.div>
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
            <motion.div
                className={cn(
                    'group flex items-center gap-4 p-4 rounded-2xl cursor-pointer', // Standardized: 16px
                    'transition-all duration-200 touch-manipulation',
                    'min-h-[56px]', // Ensure minimum touch target height
                    variant === 'primary'
                        ? [
                            'bg-gradient-to-r from-slate-900 to-slate-800',
                            'border border-slate-700/50',
                            'shadow-[0_4px_12px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.1)]'
                        ]
                        : [
                            'bg-glass-subtle backdrop-blur-glass', // Standard glass
                            'border border-white/30',
                            'shadow-glass-sm'
                        ]
                )}
                whileHover={{
                    y: -2,
                    scale: 1.01,
                    boxShadow: variant === 'primary'
                        ? '0 8px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
                        : '0 4px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.6)'
                }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
                <div className={cn(
                    'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', // Standardized: 12px
                    'transition-all duration-200 group-hover:scale-105',
                    variant === 'primary'
                        ? 'bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]'
                        : 'bg-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                )}>
                    {icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className={cn(
                        'font-semibold text-base', // Standardized: 16px
                        variant === 'primary' ? 'text-white' : 'text-slate-900'
                    )}>
                        {label}
                    </p>
                    {description && (
                        <p className={cn(
                            'text-xs mt-0.5',
                            variant === 'primary' ? 'text-white/60' : 'text-slate-500'
                        )}>
                            {description}
                        </p>
                    )}
                </div>
                <IconArrowRight
                    size={16}
                    className={cn(
                        'flex-shrink-0 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all',
                        variant === 'primary' ? 'text-white/60' : 'text-primary-500'
                    )}
                />
            </motion.div>
        </Link>
    );
});

interface SectionHeaderProps {
    title: string;
    icon?: ReactNode;
    action?: { label: string; href: string };
    className?: string;
}

export function SectionHeader({
    title,
    icon,
    action,
    className
}: SectionHeaderProps) {
    return (
        <div className={cn('flex items-center justify-between mb-4', className)}>
            <div className="flex items-center gap-2">
                {icon && <span className="text-primary-600">{icon}</span>}
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">{title}</h2>
            </div>
            {action && (
                <Link href={action.href} prefetch={true}>
                    <button className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 transition-colors">
                        {action.label}
                        <IconArrowRight size={14} />
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
    playerName?: string;
    courseName: string;
    score: number;
    toPar: number;
    date: string;
    showPlayer?: boolean;
}

export function RoundRow({
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

    return (
        <motion.div
            role="button"
            tabIndex={0}
            aria-label={accessibleLabel}
            className="group flex items-center gap-4 px-4 py-3.5 hover:bg-white/30 rounded-lg transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            whileHover={{ x: 4 }}
        >
            <div className={cn(
                'w-14 h-14 rounded-lg flex flex-col items-center justify-center flex-shrink-0',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
                toPar < 0 ? 'bg-gradient-to-br from-primary-50 to-primary-100' :
                toPar === 0 ? 'bg-gradient-to-br from-slate-50 to-slate-100' :
                'bg-gradient-to-br from-amber-50 to-amber-100'
            )}>
                <span className={cn(
                    'text-xl font-bold',
                    toPar < 0 ? 'text-primary-600' : toPar === 0 ? 'text-slate-700' : 'text-amber-600'
                )}>
                    {score}
                </span>
                <span className={cn(
                    'text-xs font-semibold',
                    toPar < 0 ? 'text-primary-500' : toPar === 0 ? 'text-slate-500' : 'text-amber-500'
                )}>
                    {toPar > 0 ? '+' : ''}{toPar}
                </span>
            </div>
            <div className="flex-1 min-w-0">
                {showPlayer && playerName && (
                    <p className="font-semibold text-slate-900 truncate">{playerName}</p>
                )}
                <p className={cn(
                    'truncate',
                    showPlayer ? 'text-sm text-slate-500' : 'font-semibold text-slate-900'
                )}>
                    {courseName}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
            </div>
            <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <IconArrowRight size={16} className="text-primary-500" />
            </div>
        </motion.div>
    );
}

// ============================================================================
// RECENT ROUND CARD (Premium — Coach Dashboard)
// ============================================================================

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
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

export interface RecentRoundCardProps {
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
            <motion.div
                role="article"
                aria-label={accessibleLabel}
                className={cn(
                    'group relative px-4 py-4',
                    'hover:bg-white/40 transition-all duration-200 cursor-pointer',
                    'focus-within:ring-2 focus-within:ring-primary-500/30 focus-within:ring-offset-1'
                )}
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
                <div className="flex items-start gap-3.5">
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
                            <p className="font-semibold text-sm text-slate-900 truncate">
                                {playerName}
                            </p>
                            <span className="text-xs text-slate-400 flex-shrink-0 tabular-nums">
                                {formatRelativeDate(date)}
                            </span>
                        </div>

                        {/* Course name + round type */}
                        <div className="flex items-center gap-1.5 mb-2.5">
                            <p className="text-[13px] text-slate-500 truncate">
                                {courseName}
                            </p>
                            {roundType && (
                                <>
                                    <span className="text-slate-300 flex-shrink-0">&middot;</span>
                                    <span className="text-xs text-slate-400 flex-shrink-0">
                                        {formatRoundType(roundType)}
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Score badge + Stat pills row */}
                        <div className="flex items-center gap-2 flex-wrap">
                            {/* Score badge — primary visual anchor */}
                            <div className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg',
                                'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
                                toPar < 0 ? 'bg-primary-50/80 border border-primary-200/60' :
                                toPar === 0 ? 'bg-slate-50/80 border border-slate-200/60' :
                                'bg-amber-50/80 border border-amber-200/60'
                            )}>
                                <span className={cn(
                                    'text-base font-bold tabular-nums leading-none',
                                    toPar < 0 ? 'text-primary-700' : toPar === 0 ? 'text-slate-700' : 'text-amber-700'
                                )}>
                                    {score}
                                </span>
                                <span className={cn(
                                    'text-xs font-semibold tabular-nums leading-none',
                                    toPar < 0 ? 'text-primary-500' : toPar === 0 ? 'text-slate-400' : 'text-amber-500'
                                )}>
                                    {toParLabel}
                                </span>
                            </div>

                            {/* Stat pills — subtle inline metrics */}
                            {hasStats && (
                                <div className="flex items-center gap-1.5">
                                    {totalPutts !== null && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/70 text-xs font-medium text-slate-500 tabular-nums">
                                            <svg className="w-3 h-3 text-slate-400" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>
                                            {totalPutts} putts
                                        </span>
                                    )}
                                    {firPct !== null && (
                                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/70 text-xs font-medium text-slate-500 tabular-nums">
                                            FIR {firPct}%
                                        </span>
                                    )}
                                    {girPct !== null && (
                                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100/70 text-xs font-medium text-slate-500 tabular-nums">
                                            GIR {girPct}%
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Arrow indicator */}
                    <div className="flex-shrink-0 mt-2 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200">
                        <IconArrowRight size={14} className="text-primary-500" />
                    </div>
                </div>
            </motion.div>
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
        2: { bg: 'bg-gradient-to-br from-slate-100 to-slate-200', text: 'text-slate-600', icon: '🥈' },
        3: { bg: 'bg-gradient-to-br from-orange-100 to-orange-200', text: 'text-orange-600', icon: '🥉' }
    };

    const colors = rankColors[rank] || { bg: 'bg-slate-100', text: 'text-slate-500' };
    const rankLabel = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`;

    return (
        <motion.div
            role="listitem"
            aria-label={`${rankLabel} place: ${name}, average score ${avgScore.toFixed(1)} over ${rounds} rounds`}
            className="flex items-center gap-3 px-4 py-3.5 hover:bg-white/30 rounded-lg transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2" // Standardized: 12px
            whileHover={{ x: 4 }}
            tabIndex={0}
        >
            <div className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold', // Standardized: 12px
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]',
                colors.bg, colors.text
            )}>
                {colors.icon || rank}
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{name}</p>
                <p className="text-xs text-slate-500">{rounds} rounds</p>
            </div>
            <div className="text-right">
                <p className="font-bold text-slate-900 tabular-nums">{avgScore.toFixed(1)}</p>
                <p className="text-xs text-slate-400 uppercase tracking-wide">avg</p>
            </div>
        </motion.div>
    );
}
