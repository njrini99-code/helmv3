import {
  Target,
  UserPlus,
  LogIn,
  Lightbulb,
  MessageSquare,
  CalendarPlus,
  Sparkles,
  FileText,
  Dumbbell,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import type { ActivityKind } from '@/lib/admin/data/activity';
import type { FwStatusTone } from '@/components/fairway';

/**
 * Helm Bridge V2 — Activity tab kind vocabulary (ONE place the row chip,
 * the FilterPill row, and the day-grouped feed all read from — no
 * per-component copy of the label/icon/tone triad).
 *
 * Order here is fixed by the owner's spec: "All/Rounds/Sign-ups/Sign-ins/
 * Insights/Messages/Events/Demos/Documents/Errors" — the FilterPill row
 * renders in exactly this order.
 *
 * GREEN CONTRACT: red is reserved for genuine errors (`error` → danger);
 * `demo_session` is the one deliberately-highlighted "leader" kind (→
 * accent/green wash on its feed rows); every other kind stays neutral so
 * color never becomes a decorative rainbow across nine unrelated kinds.
 */
export interface ActivityKindMeta {
  kind: ActivityKind;
  /** Plural label for the FilterPill chip. */
  chipLabel: string;
  icon: LucideIcon;
  tone: FwStatusTone;
}

export const ACTIVITY_KIND_META: readonly ActivityKindMeta[] = [
  { kind: 'round_submitted', chipLabel: 'Rounds/Games', icon: Target, tone: 'neutral' },
  { kind: 'signup', chipLabel: 'Sign-ups', icon: UserPlus, tone: 'neutral' },
  { kind: 'sign_in', chipLabel: 'Sign-ins', icon: LogIn, tone: 'neutral' },
  { kind: 'insight_generated', chipLabel: 'Insights', icon: Lightbulb, tone: 'neutral' },
  { kind: 'message_sent', chipLabel: 'Messages', icon: MessageSquare, tone: 'neutral' },
  { kind: 'event_created', chipLabel: 'Events', icon: CalendarPlus, tone: 'neutral' },
  { kind: 'demo_session', chipLabel: 'Demos', icon: Sparkles, tone: 'accent' },
  { kind: 'document_uploaded', chipLabel: 'Documents', icon: FileText, tone: 'neutral' },
  { kind: 'lift_session_logged', chipLabel: 'Lift sessions', icon: Dumbbell, tone: 'neutral' },
  { kind: 'error', chipLabel: 'Errors', icon: AlertTriangle, tone: 'danger' },
] as const;

const META_BY_KIND: Record<ActivityKind, ActivityKindMeta> = Object.fromEntries(
  ACTIVITY_KIND_META.map((m) => [m.kind, m]),
) as Record<ActivityKind, ActivityKindMeta>;

export function kindMeta(kind: ActivityKind): ActivityKindMeta {
  return META_BY_KIND[kind];
}

/** The row icon-chip's tinted background + icon color per tone. Only the
 *  three tones ACTIVITY_KIND_META actually uses are given real treatments;
 *  anything else (not reachable today) falls back to neutral. */
export function kindChipClasses(tone: FwStatusTone): { bg: string; icon: string } {
  switch (tone) {
    case 'accent':
      return { bg: 'bg-accent-100', icon: 'text-accent-700' };
    case 'danger':
      return { bg: 'bg-fw-danger-bg', icon: 'text-fw-danger-ink' };
    default:
      return { bg: 'bg-surface-sunken', icon: 'text-warm-500' };
  }
}

/** Type guard for the `type` searchParam — an unrecognized/missing value
 *  means "no kind filter" (never a 400, mirrors parseErrorsFilters). */
export function isActivityKind(value: string | undefined): value is ActivityKind {
  return value !== undefined && value in META_BY_KIND;
}
