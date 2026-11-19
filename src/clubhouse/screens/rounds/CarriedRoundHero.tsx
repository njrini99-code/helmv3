'use client';

import { usePathname } from 'next/navigation';
import { useCarried } from '../../lib/carry';
import type { ChTeeColor } from '../../data/rounds-shape';
import { Skeleton } from '../../ui/States';
import { TeeSwatch } from './parts';

/**
 * The phone review skeleton's hero (E-1, audit 2026-11-19): when the round was opened from a row, the hero is drawn with
 * what that row showed (the player and day, the course, the tee, the score and its par), in the review's own hero
 * markup and place, so the push lands on the round itself and only the card and figures below wait. Opened any other
 * way (a deep link, a notification), the plain feature-card block. The score carries `data-ch-share`, the end the
 * row's score travels to over the push (E-6, lib/share-morph.ts).
 */
export function CarriedRoundHero() {
  const path = usePathname();
  const r = useCarried(path, 'round');
  if (!r) return <Skeleton width="100%" height={207.4} radius={16} shape="feature" />;
  return (
    <header className="ch-rv-hero" aria-hidden="true" data-ch-carried="">
      <div className="ch-rv-hero__l">
        <span className="ch-rv-hero__k">{r.kicker}</span>
        <h2>{r.course}</h2>
        {r.tee && (
          <span className="ch-rv-hero__m">
            <TeeSwatch color={(r.teeColor ?? null) as ChTeeColor | null} />
            <span>{r.tee}</span>
          </span>
        )}
      </div>
      <div className="ch-rv-hero__s">
        <b className="ch-num" data-ch-share="round-score">
          {r.score}
        </b>
        <em className={'ch-num' + (r.under ? ' is-under' : '')}>{r.toPar}</em>
        <span>{r.nine ? 'Strokes · 9 holes' : 'Strokes'}</span>
      </div>
    </header>
  );
}
