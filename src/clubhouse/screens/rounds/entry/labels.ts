import { describeRoundWriteFailure } from '@/lib/golf/round-missing-recovery';
import { friendlyReason } from '../../../lib/use-action';

/**
 * "just now", "5 min ago", "2h ago", "3d ago". The legacy prompts each had a
 * style (the recovery dialog minutes and hours, the in-progress prompt hours
 * and days); this is both. Null when there is no usable time.
 */
export function ago(at: number | string | null | undefined, now: number): string | null {
  if (at == null) return null;
  const t = typeof at === 'number' ? at : Date.parse(at);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

/**
 * The reason a round write failed, as a sentence the player can read, or null
 * when there is none worth showing. The round actions return bare signal keys
 * ("busy", "retry", "conflict", "round_missing") that friendlyReason alone would
 * print as "busy."; the legacy sentences for them come first, as written (one
 * is longer than friendlyReason's 140-character cap, which would drop it).
 */
export function reasonText(reason: string | null | undefined): string | null {
  const r = reason?.trim();
  if (!r) return null;
  const described = describeRoundWriteFailure(r);
  return described !== r ? described : friendlyReason(r);
}

/** An inline failure line: what failed, then the reason when the server gave a readable one, else what to do next. */
export function failureLine(what: string, reason: string | null | undefined, hint: string): string {
  return `${what} ${reasonText(reason) ?? hint}`;
}

const TYPES: Record<string, string> = { practice: 'Practice', tournament: 'Tournament', qualifier: 'Qualifier' };

/** "Practice", "Tournament", "Qualifier" for a round type; anything else is capitalised as given. */
export function typeLabel(type: string | null | undefined): string | null {
  const t = type?.trim();
  if (!t) return null;
  return TYPES[t.toLowerCase()] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * The card's one line of facts, in the Library card's voice ("Blue tees · Practice"),
 * skipping what isn't known: `lead` first (a state such as "In progress"), then the tees and
 * type, then when.
 */
export function factsLine(parts: { lead?: string | null; tees?: string | null; type?: string | null; when?: string | null }): string | null {
  const bits = [parts.lead?.trim(), parts.tees?.trim() ? `${parts.tees.trim()} tees` : null, typeLabel(parts.type), parts.when];
  const line = bits.filter(Boolean).join(' · ');
  return line || null;
}
