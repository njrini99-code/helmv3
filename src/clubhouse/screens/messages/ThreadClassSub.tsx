'use client';

import { classStatusFor } from '../../data/class-status';
import { ClassStatusLine, useClassText } from '../../ui/ClassStatusLine';
import { Swap } from '../../ui/Swap';
import { directClassPlayer, type ChThreadClassDay } from './class-thread';
import type { ChConv, ChPerson } from './model';

/**
 * The thread header's sub line for a coach looking at a 1:1 with a player (P-10). With a status it is the status line
 * ("In class until 11:50 AM"); on desktop the usual subtitle follows after a dot, on the phone the status replaces it.
 * Without one it is the usual subtitle, untouched. The swap between them is the only motion; the class label never
 * appears here (the header is visible over a shoulder: the label lives in the details panel).
 *
 * Reads nothing and fetches nothing: the status comes from the cached class day the container already holds, and a
 * player, a group, a 1:1 outside the coach's team or an unknown team draws exactly what it drew before.
 */
export function ThreadClassSub({ cls, conv, other, sub, where }: { cls: ChThreadClassDay | null | undefined; conv: ChConv; other: ChPerson | undefined; sub: string; where: 'desktop' | 'phone' }) {
  const player = directClassPlayer(cls, conv, other);
  const text = useClassText(cls?.day ? { teamTimeZone: cls.day.teamTimeZone, classTimeZone: cls.day.classTimeZone } : null);
  const status = player && cls?.now != null ? classStatusFor(player, cls.now) : null;
  const line = status ? text(status) : null;
  if (!status || !line) return <>{sub}</>;
  return (
    <Swap swapKey={line} inline>
      <ClassStatusLine kind={status.kind} text={line} />
      {where === 'desktop' && sub ? <span className="ch-ca-sub">{` · ${sub}`}</span> : null}
    </Swap>
  );
}
