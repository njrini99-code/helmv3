/**
 * Baseball event type configuration
 * Shared across all baseball calendar components for consistency.
 */

import {
  Dumbbell,
  Trophy,
  Swords,
  Users,
  Activity,
  Target,
  Tent,
  MoreHorizontal,
  UserCheck,
  CalendarClock,
  type LucideIcon,
} from 'lucide-react';

export type BaseballEventType =
  | 'practice'
  | 'game'
  | 'tournament'
  | 'meeting'
  | 'workout'
  | 'scrimmage'
  | 'camp'
  | 'recruiting_visit'
  | 'deadline'
  | 'other';

export interface EventTypeConfig {
  type: BaseballEventType;
  label: string;
  icon: LucideIcon;
  dotColor: string;
  bgColor: string;
  textColor: string;
  borderColor: string;
  activeBg: string;
  activeText: string;
  activeShadow: string;
  inactiveBg: string;
  inactiveText: string;
  headerGradient: string;
}

export const BASEBALL_EVENT_TYPES: EventTypeConfig[] = [
  {
    type: 'practice',
    label: 'Practice',
    icon: Dumbbell,
    dotColor: 'bg-blue-500',
    bgColor: 'bg-blue-50/80',
    textColor: 'text-blue-800',
    borderColor: 'border-l-blue-500',
    activeBg: 'bg-blue-600',
    activeText: 'text-white',
    activeShadow: 'shadow-blue-600/30',
    inactiveBg: 'bg-blue-50 hover:bg-blue-100',
    inactiveText: 'text-blue-700',
    headerGradient: 'from-blue-50 to-white',
  },
  {
    type: 'game',
    label: 'Game',
    icon: Trophy,
    dotColor: 'bg-green-500',
    bgColor: 'bg-green-50/80',
    textColor: 'text-green-800',
    borderColor: 'border-l-green-500',
    activeBg: 'bg-green-600',
    activeText: 'text-white',
    activeShadow: 'shadow-green-600/30',
    inactiveBg: 'bg-green-50 hover:bg-green-100 active:bg-green-200',
    inactiveText: 'text-green-700',
    headerGradient: 'from-green-50 to-white',
  },
  {
    type: 'tournament',
    label: 'Tournament',
    icon: Target,
    dotColor: 'bg-purple-500',
    bgColor: 'bg-purple-50/80',
    textColor: 'text-purple-800',
    borderColor: 'border-l-purple-500',
    activeBg: 'bg-purple-600',
    activeText: 'text-white',
    activeShadow: 'shadow-purple-600/30',
    inactiveBg: 'bg-purple-50 hover:bg-purple-100',
    inactiveText: 'text-purple-700',
    headerGradient: 'from-purple-50 to-white',
  },
  {
    type: 'meeting',
    label: 'Meeting',
    icon: Users,
    dotColor: 'bg-amber-500',
    bgColor: 'bg-amber-50/80',
    textColor: 'text-amber-800',
    borderColor: 'border-l-amber-500',
    activeBg: 'bg-amber-500',
    activeText: 'text-white',
    activeShadow: 'shadow-amber-500/30',
    inactiveBg: 'bg-amber-50 hover:bg-amber-100',
    inactiveText: 'text-amber-700',
    headerGradient: 'from-amber-50 to-white',
  },
  {
    type: 'workout',
    label: 'Workout',
    icon: Activity,
    dotColor: 'bg-cyan-500',
    bgColor: 'bg-cyan-50/80',
    textColor: 'text-cyan-800',
    borderColor: 'border-l-cyan-500',
    activeBg: 'bg-cyan-600',
    activeText: 'text-white',
    activeShadow: 'shadow-cyan-600/30',
    inactiveBg: 'bg-cyan-50 hover:bg-cyan-100',
    inactiveText: 'text-cyan-700',
    headerGradient: 'from-cyan-50 to-white',
  },
  {
    type: 'scrimmage',
    label: 'Scrimmage',
    icon: Swords,
    dotColor: 'bg-orange-500',
    bgColor: 'bg-orange-50/80',
    textColor: 'text-orange-800',
    borderColor: 'border-l-orange-500',
    activeBg: 'bg-orange-500',
    activeText: 'text-white',
    activeShadow: 'shadow-orange-500/30',
    inactiveBg: 'bg-orange-50 hover:bg-orange-100',
    inactiveText: 'text-orange-700',
    headerGradient: 'from-orange-50 to-white',
  },
  {
    type: 'camp',
    label: 'Camp',
    icon: Tent,
    dotColor: 'bg-pink-500',
    bgColor: 'bg-pink-50/80',
    textColor: 'text-pink-800',
    borderColor: 'border-l-pink-500',
    activeBg: 'bg-pink-500',
    activeText: 'text-white',
    activeShadow: 'shadow-pink-500/30',
    inactiveBg: 'bg-pink-50 hover:bg-pink-100',
    inactiveText: 'text-pink-700',
    headerGradient: 'from-pink-50 to-white',
  },
  {
    type: 'recruiting_visit',
    label: 'Recruiting Visit',
    icon: UserCheck,
    dotColor: 'bg-indigo-500',
    bgColor: 'bg-indigo-50/80',
    textColor: 'text-indigo-800',
    borderColor: 'border-l-indigo-500',
    activeBg: 'bg-indigo-600',
    activeText: 'text-white',
    activeShadow: 'shadow-indigo-600/30',
    inactiveBg: 'bg-indigo-50 hover:bg-indigo-100',
    inactiveText: 'text-indigo-700',
    headerGradient: 'from-indigo-50 to-white',
  },
  {
    type: 'deadline',
    label: 'Deadline',
    icon: CalendarClock,
    dotColor: 'bg-red-500',
    bgColor: 'bg-red-50/80',
    textColor: 'text-red-800',
    borderColor: 'border-l-red-500',
    activeBg: 'bg-red-600',
    activeText: 'text-white',
    activeShadow: 'shadow-red-600/30',
    inactiveBg: 'bg-red-50 hover:bg-red-100',
    inactiveText: 'text-red-700',
    headerGradient: 'from-red-50 to-white',
  },
  {
    type: 'other',
    label: 'Other',
    icon: MoreHorizontal,
    dotColor: 'bg-slate-400',
    bgColor: 'bg-slate-50/80',
    textColor: 'text-slate-700',
    borderColor: 'border-l-slate-400',
    activeBg: 'bg-slate-600',
    activeText: 'text-white',
    activeShadow: 'shadow-slate-600/30',
    inactiveBg: 'bg-slate-100 hover:bg-slate-200 active:bg-slate-300',
    inactiveText: 'text-slate-600',
    headerGradient: 'from-slate-50 to-white',
  },
];

export function getEventTypeConfig(type: string): EventTypeConfig {
  return (
    BASEBALL_EVENT_TYPES.find((t) => t.type === type) ||
    BASEBALL_EVENT_TYPES[BASEBALL_EVENT_TYPES.length - 1]!
  );
}

export function formatEventTime(dateTimeStr: string | null | undefined): string {
  if (!dateTimeStr) return '';
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export function formatEventDate(dateTimeStr: string): string {
  try {
    const date = new Date(dateTimeStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}
