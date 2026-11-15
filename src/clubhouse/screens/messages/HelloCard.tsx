'use client';

import { useRef } from 'react';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { Avatar } from '../../ui/Avatar';
import { msAnimate } from './motion/messages-motion';

/** The page's three starters for a coach, and the three for a player (08 MSG-FRESH-01, 03). */
export const COACH_STARTERS = ['Can you send me your card from today?', 'Nice round. What clicked?', 'Can we meet before practice Monday?'] as const;
export const PLAYER_STARTERS = ['Can we find time to talk this week?', 'Here’s my round from today', 'Quick question about practice'] as const;

/** Where a starter's words land: the composer's pill (thread/Composer.tsx, `.ch-ms-comp__field`). */
const COMPOSER_PILL = '.ch-ms-comp__field';

/**
 * An empty thread (MSG-222): face 72, name, role and "No messages yet", and three starters. A starter fills the field and
 * the composer's pill answers with `scale .98 > 1` on `pop` (MOT-EMP-3, none under Reduce Motion). It NEVER sends.
 */
export function HelloCard({ name, id, role, coach, year, onStarter }: { name: string; id?: string | null; role: string; coach: boolean; year?: Parameters<typeof Avatar>[0]['year']; onStarter: (text: string) => void }) {
  const reduced = useChReducedMotion();
  const card = useRef<HTMLElement | null>(null);
  const fill = (text: string) => {
    onStarter(text);
    // The page's composer, not one inside the card: the pill is a sibling of the thread's scroller.
    const pill = (card.current?.closest('.ch-ms-thread, .ch-msp-thread, .ch-msp-screen, main') ?? document).querySelector<HTMLElement>(COMPOSER_PILL);
    if (pill) msAnimate(pill, [{ transform: 'scale(0.98)' }, { transform: 'scale(1)' }], 'pop', { reduced, rd: null });
  };
  return (
    <section ref={card} className="ch-msv-hello ch-msd-hello">
      <Avatar name={name} id={id} size={72} year={year} />
      <b>{name}</b>
      <small>{[role, 'No messages yet'].filter(Boolean).join(' · ')}</small>
      <div className="ch-msv-hello__s">
        {(coach ? COACH_STARTERS : PLAYER_STARTERS).map((s) => (
          <button key={s} type="button" onClick={() => fill(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
