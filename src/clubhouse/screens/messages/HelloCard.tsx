'use client';

import { Avatar } from '../../ui/Avatar';

/** The page's three starters for a coach, and the three for a player (08 MSG-FRESH-01, 03). */
export const COACH_STARTERS = ['Can you send me your card from today?', 'Nice round. What clicked?', 'Can we meet before practice Monday?'] as const;
export const PLAYER_STARTERS = ['Can we find time to talk this week?', 'Here’s my round from today', 'Quick question about practice'] as const;

/** An empty thread (S-MSG.fresh): face, name, role and three starters. A starter fills the field; it never sends. */
export function HelloCard({ name, id, role, coach, year, onStarter }: { name: string; id?: string | null; role: string; coach: boolean; year?: Parameters<typeof Avatar>[0]['year']; onStarter: (text: string) => void }) {
  return (
    <section className="ch-msv-hello">
      <Avatar name={name} id={id} size="xl" year={year} />
      <b>{name}</b>
      <small>{[role, 'No messages yet'].filter(Boolean).join(' · ')}</small>
      <div className="ch-msv-hello__s">
        {(coach ? COACH_STARTERS : PLAYER_STARTERS).map((s) => (
          <button key={s} type="button" onClick={() => onStarter(s)}>
            {s}
          </button>
        ))}
      </div>
    </section>
  );
}
