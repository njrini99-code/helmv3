import type { LucideIcon } from 'lucide-react';
import {
  Award,
  BarChart3,
  Crosshair,
  Flag,
  Home,
  LineChart,
  MapPin,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import type { StatsCategory } from '@/components/golf/stats/GolfStatsDisplay';

export type { StatsCategory };

export interface StatsCategoryDef {
  id: StatsCategory;
  label: string;
  shortLabel: string;
  hint: string;
  icon: LucideIcon;
  /** Active tab chip */
  activeRing: string;
  activeBg: string;
  activeBorder: string;
  iconColor: string;
  /** Section left rail */
  accent: string;
}

/** Premium green-forward palette — area accents only where they aid scan. */
export const STATS_CATEGORY_DEFS: readonly StatsCategoryDef[] = [
  {
    id: 'overview',
    label: 'Overview',
    shortLabel: 'Overview',
    hint: 'Game snapshot',
    icon: Home,
    activeRing: 'ring-accent-600/45',
    activeBg: 'bg-accent-600/12',
    activeBorder: 'border-accent-600/40',
    iconColor: 'text-accent-700',
    accent: 'border-l-accent-600',
  },
  {
    id: 'progress',
    label: 'Progress',
    shortLabel: 'Progress',
    hint: 'Trends over time',
    icon: LineChart,
    activeRing: 'ring-emerald-600/35',
    activeBg: 'bg-emerald-500/10',
    activeBorder: 'border-emerald-600/35',
    iconColor: 'text-emerald-800',
    accent: 'border-l-emerald-600',
  },
  {
    id: 'dispersion',
    label: 'Spray charts',
    shortLabel: 'Spray',
    hint: 'Shot patterns',
    icon: Crosshair,
    activeRing: 'ring-teal-600/35',
    activeBg: 'bg-teal-500/10',
    activeBorder: 'border-teal-600/35',
    iconColor: 'text-teal-800',
    accent: 'border-l-teal-600',
  },
  {
    id: 'scoring',
    label: 'Scoring',
    shortLabel: 'Scoring',
    hint: 'Pars & round history',
    icon: Award,
    activeRing: 'ring-accent-600/35',
    activeBg: 'bg-accent-500/10',
    activeBorder: 'border-accent-600/30',
    iconColor: 'text-accent-800',
    accent: 'border-l-accent-600',
  },
  {
    id: 'driving',
    label: 'Driving',
    shortLabel: 'Driving',
    hint: 'Off the tee',
    icon: Flag,
    activeRing: 'ring-sky-600/35',
    activeBg: 'bg-sky-500/10',
    activeBorder: 'border-sky-600/35',
    iconColor: 'text-sky-800',
    accent: 'border-l-sky-500',
  },
  {
    id: 'approach',
    label: 'Approach',
    shortLabel: 'Approach',
    hint: 'GIR & proximity',
    icon: Target,
    activeRing: 'ring-lime-600/35',
    activeBg: 'bg-lime-500/10',
    activeBorder: 'border-lime-600/35',
    iconColor: 'text-lime-900',
    accent: 'border-l-lime-600',
  },
  {
    id: 'putting',
    label: 'Putting',
    shortLabel: 'Putting',
    hint: 'Make rate by distance',
    icon: Zap,
    activeRing: 'ring-emerald-600/40',
    activeBg: 'bg-emerald-500/12',
    activeBorder: 'border-emerald-600/40',
    iconColor: 'text-emerald-800',
    accent: 'border-l-emerald-600',
  },
  {
    id: 'scrambling',
    label: 'Scrambling',
    shortLabel: 'Short game',
    hint: 'Up & down saves',
    icon: TrendingUp,
    activeRing: 'ring-amber-600/35',
    activeBg: 'bg-amber-500/10',
    activeBorder: 'border-amber-600/35',
    iconColor: 'text-amber-900',
    accent: 'border-l-amber-500',
  },
  {
    id: 'strokes-gained',
    label: 'Strokes gained',
    shortLabel: 'SG',
    hint: 'Vs Tour by area',
    icon: BarChart3,
    activeRing: 'ring-accent-600/50',
    activeBg: 'bg-accent-600/14',
    activeBorder: 'border-accent-600/45',
    iconColor: 'text-accent-700',
    accent: 'border-l-accent-600',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    shortLabel: 'Analysis',
    hint: 'Courses & holes',
    icon: MapPin,
    activeRing: 'ring-stone-600/30',
    activeBg: 'bg-stone-500/10',
    activeBorder: 'border-stone-500/30',
    iconColor: 'text-stone-700',
    accent: 'border-l-stone-400',
  },
] as const;

export const SG_AREA_THEME: Record<
  string,
  { label: string; tint: string; border: string; value: string }
> = {
  sg_ott: { label: 'Off the tee', tint: 'bg-sky-500/10', border: 'border-sky-500/30', value: 'text-sky-800' },
  sg_approach: { label: 'Approach', tint: 'bg-lime-500/10', border: 'border-lime-500/30', value: 'text-lime-900' },
  sg_around_green: { label: 'Around the green', tint: 'bg-amber-500/10', border: 'border-amber-500/30', value: 'text-amber-900' },
  sg_putting: { label: 'Putting', tint: 'bg-emerald-500/12', border: 'border-emerald-500/35', value: 'text-emerald-900' },
};

export function getCategoryDef(id: StatsCategory): StatsCategoryDef {
  return STATS_CATEGORY_DEFS.find((d) => d.id === id) ?? STATS_CATEGORY_DEFS[0]!;
}

/** @deprecated Draft 4-tab nav — kept for GameAreaPicker / PlayerStatsTabNav stubs. */
export type StatsTabId = 'overview' | 'areas' | 'scoring' | 'matrix';
export type GameAreaId = 'driving' | 'approach' | 'putting' | 'scrambling';

export interface StatsTabDef {
  id: StatsTabId;
  playerLabel: string;
  coachLabel: string;
  hint: string;
  icon: LucideIcon;
  activeRing: string;
  activeBg: string;
  iconColor: string;
}

export const STATS_TAB_DEFS: readonly StatsTabDef[] = [
  { id: 'overview', playerLabel: 'My game', coachLabel: 'Overview', hint: 'Strokes gained & leaks', icon: Home, activeRing: 'ring-accent-600/40', activeBg: 'bg-accent-600/10', iconColor: 'text-accent-700' },
  { id: 'areas', playerLabel: 'By area', coachLabel: 'By area', hint: 'Tee · approach · putts · short', icon: Crosshair, activeRing: 'ring-sky-500/35', activeBg: 'bg-sky-500/10', iconColor: 'text-sky-700' },
  { id: 'scoring', playerLabel: 'Scoring', coachLabel: 'Scoring', hint: 'Trends & round history', icon: Award, activeRing: 'ring-accent-600/35', activeBg: 'bg-accent-500/10', iconColor: 'text-accent-800' },
  { id: 'matrix', playerLabel: 'All stats', coachLabel: 'Full matrix', hint: 'Every tracked metric', icon: BarChart3, activeRing: 'ring-stone-500/35', activeBg: 'bg-stone-500/10', iconColor: 'text-stone-700' },
] as const;

export interface GameAreaDef {
  id: GameAreaId;
  label: string;
  short: string;
  tint: string;
  border: string;
  header: string;
  iconColor: string;
  icon: LucideIcon;
}

export const GAME_AREA_DEFS: readonly GameAreaDef[] = [
  { id: 'driving', label: 'Off the tee', short: 'Driving', tint: 'bg-sky-500/10', border: 'border-sky-500/25', header: 'from-sky-500/15 to-surface', iconColor: 'text-sky-700', icon: Flag },
  { id: 'approach', label: 'Approach', short: 'Approach', tint: 'bg-lime-500/10', border: 'border-lime-500/25', header: 'from-lime-500/15 to-surface', iconColor: 'text-lime-900', icon: Target },
  { id: 'putting', label: 'Putting', short: 'Putting', tint: 'bg-emerald-500/12', border: 'border-emerald-500/30', header: 'from-emerald-500/15 to-surface', iconColor: 'text-emerald-800', icon: Zap },
  { id: 'scrambling', label: 'Short game', short: 'Short game', tint: 'bg-amber-500/10', border: 'border-amber-500/25', header: 'from-amber-500/15 to-surface', iconColor: 'text-amber-900', icon: TrendingUp },
] as const;
