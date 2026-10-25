import type { ChClassDayPlayer } from '../../data/class-day-shape';
import { classStatusFor, composerPlaceholder, notifyAnywayTargets, type ChClassStatus } from '../../data/class-status';
import type { ChThreadClassDay } from './class-thread';
import { plural } from '../../lib/plural';
import { firstName, type ChConv, type ChPerson } from './model';

/**
 * P-10 Notify anyway, the rule for when it exists. A coach, in a conversation that belongs to the coach's team, with at least one
 * recipient who is in a class or an exam right now AND whose pushes are held. Anything else (a player, a conversation with no team
 * or another team's, a recipient who is not in class, one whose pushes are not held, a class that is only about to start) offers
 * nothing: Send behaves exactly as it always has and no menu, chevron or shortcut exists.
 *
 * Pure: the status words come in as a function, so the composer, the menu and the tests share the same rule.
 */
export type ChSendNotify = {
  /** The composer placeholder, for a direct thread only ("Won't interrupt Theo in class"). Null in a group. */
  placeholder: string | null;
  /** The recipients a hold would be skipped for. At least one. */
  targets: ChClassDayPlayer[];
  /** The menu's second line: who and until when, and that this skips the hold. It promises nothing about when anyone reads it. */
  caption: string;
};

export const SKIPS_HOLD = 'skips the class hold';

export function sendNotify(
  cls: ChThreadClassDay | null | undefined,
  conv: Pick<ChConv, 'group' | 'memberIds'>,
  personOf: (userId: string) => Pick<ChPerson, 'role' | 'playerId' | 'name'> | undefined,
  statusText: (status: ChClassStatus) => string | null,
): ChSendNotify | null {
  if (!cls?.day || cls.now == null) return null;
  if (cls.convTeamId == null || cls.convTeamId !== cls.teamId) return null;
  const { day, now } = cls;

  if (!conv.group) {
    const other = personOf(conv.memberIds[0] ?? '');
    if (other?.role !== 'player' || !other.playerId) return null;
    const targets = notifyAnywayTargets(day, [other.playerId], now);
    const player = targets[0];
    if (!player) return null;
    const line = statusText(classStatusFor(player, now));
    if (!line) return null;
    return { placeholder: composerPlaceholder(player, now, firstName(other.name)), targets, caption: `${line} · ${SKIPS_HOLD}` };
  }

  const playerIds = conv.memberIds.flatMap((id) => {
    const p = personOf(id);
    return p?.role === 'player' && p.playerId ? [p.playerId] : [];
  });
  const targets = notifyAnywayTargets(day, playerIds, now);
  if (targets.length === 0) return null;
  return { placeholder: null, targets, caption: `${plural(targets.length, 'person here is', 'people here are')} in class · ${SKIPS_HOLD}` };
}

/** The keys that send with Notify anyway on a desktop: Cmd+Shift+Enter on a Mac (spelled out: the key symbols are not in the face's subset), Ctrl+Shift+Enter elsewhere. */
export function isNotifyChord(e: { key: string; shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }): boolean {
  return e.key === 'Enter' && e.shiftKey && (e.metaKey || e.ctrlKey);
}

/** The hint under the composer and the menu's shortcut label. */
export function notifyChordLabel(mac: boolean): { hint: string; menu: string } {
  return mac ? { hint: 'Cmd Shift Enter to notify anyway', menu: 'Cmd Shift Enter' } : { hint: 'Ctrl Shift Enter to notify anyway', menu: 'Ctrl Shift Enter' };
}
