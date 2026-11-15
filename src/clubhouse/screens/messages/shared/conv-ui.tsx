'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChConv, ChPerson } from '../model';
import { personOf } from '../person-of';
import type { ReactNode } from 'react';
import { PlayerPeek } from '../../../ui/PlayerPeek';
import { classYearKey } from '../../../lib/class-year';
import { Icon } from '../../../ui/Icon';
import { Flag, Users } from 'lucide-react';

/** B19: a direct conversation's coin takes the other person's tone, from the id their coin has everywhere (a player's
 *  player id, else a coach's user id); a group has none. */
/** The name a conversation's coin is drawn from: none for a former member, whose initials would mean nothing ("FM"; it was "CM"). */
export function convAvatarName(c: Pick<ChConv, 'title' | 'former'>): string {
  return c.former ? '' : c.title;
}

export const convAvatarId = (api: ChMessagesApi, c: ChConv): string | null => {
  if (c.group) return null;
  const other = c.memberIds.find((id) => id !== api.viewer.userId);
  return other ? (personOf(api, other)?.playerId ?? other) : null;
};

/**
 * P003-C1: for the coach, a player's avatar and name in a thread peek at the player, from the team directory Messages
 * already holds. The bubble keeps its own hold (message actions); coaches and people off the roster don't peek.
 */
export function SenderPeek({ api, who, children }: { api: ChMessagesApi; who: ChPerson | undefined; children: ReactNode }) {
  if (api.viewer.role !== "coach" || who?.role !== "player" || !who.playerId) return <>{children}</>;
  return <PlayerPeek player={{ id: who.playerId, name: who.name, sub: who.subtitle || null }}>{children}</PlayerPeek>;
}

/** A direct thread with a player whose year is known: the coin's year colour. */
export function convYear(api: ChMessagesApi, c: ChConv) {
  if (c.group) return null;
  const person = personOf(api, c.memberIds[0] ?? "");
  return person?.gradYear ? classYearKey(person.gradYear, new Date(api.now), api.timeZone) : null;
}

/* Thread */

export const GroupMark = ({ size, flag = false }: { size: "sm" | "md" | "lg"; flag?: boolean }) => (
  <span className={`ch-msp-mark is-${size}`} aria-hidden="true">
    <Icon icon={flag ? Flag : Users} size={size === "lg" ? 28 : size === "md" ? 17 : 15} />
  </span>
);
