import { BookOpen, Bus, CalendarDays, Flag, Lock, Target, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { ChCalType } from './model';

/** One icon per calendar event type: a leaf module, so views, peek and Home can share it without an import cycle. */
export const TYPE_ICON: Record<ChCalType, LucideIcon> = {
  practice: Flag,
  qualifier: Target,
  tournament: Trophy,
  meeting: Users,
  travel: Bus,
  class: BookOpen,
  other: CalendarDays,
  busy: Lock,
};
