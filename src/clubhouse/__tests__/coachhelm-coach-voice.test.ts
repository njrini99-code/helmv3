import { describe, expect, it } from 'vitest';

/**
 * chs-40: a coach's read is spoken from the engine's stored coach copy (`evidence.coach_copy`) when the row carries it, and from
 * the row's own text through `speak`'s regex when it does not (design call, "Coach voice vs player voice"). Numbers are identical
 * in both voices: a coach part whose numbers differ is not used. A player never reads the coach copy, and the focus area a coach
 * assigns is saved in the player's own words.
 */

import { toChInsight } from '../data/coachhelm-map';
import { notEnoughRead } from '../data/coachhelm-firm';
import { numbersIn, readTextFor, sameNumbers, speak } from '../data/coachhelm-voice';
import { HELM_PLAYERS, PREVIEW_TOUR, slope } from '../preview/fixtures-coachhelm';
import { PREVIEW_HELM_COACH_COACH_COPY, SLOPE_COACH_COPY, withCoachCopy } from '../preview/fixtures-coachhelm-voice';

const COACH = { role: 'coach', first: 'Jonah' } as const;
const ME = { role: 'player' } as const;
const plain = (t: string | null | undefined) => (t ?? '').replace(/\u00a0/g, ' ');
const row = () => withCoachCopy(slope(HELM_PLAYERS.jonah.id), SLOPE_COACH_COPY);

describe('readTextFor', () => {
  it('a coach reads the stored coach copy; a player never does', () => {
    expect(readTextFor(row(), true)).toMatchObject({ title: SLOPE_COACH_COPY.title, content: SLOPE_COACH_COPY.content, coachCopy: { title: true, content: true } });
    const mine = readTextFor(row(), false);
    expect(mine.title).toBe(row().title);
    expect(mine.coachCopy).toEqual({ title: false, content: false });
  });

  it('no coach copy, or an empty part, falls back to the row’s own text, part by part', () => {
    const bare = slope(HELM_PLAYERS.jonah.id);
    expect(readTextFor(bare, true)).toMatchObject({ title: bare.title, content: bare.content, coachCopy: { title: false, content: false } });
    const half = withCoachCopy(bare, { title: 'Downhill putts from 4-6 ft', content: '  ' });
    expect(readTextFor(half, true)).toMatchObject({ title: 'Downhill putts from 4-6 ft', content: bare.content, coachCopy: { title: true, content: false } });
  });

  it('a coach part whose numbers differ from the player’s is not used', () => {
    const wrong = withCoachCopy(slope(HELM_PLAYERS.jonah.id), { title: 'Downhill putts from 4-7 ft', content: SLOPE_COACH_COPY.content.replace('58%', '57%') });
    expect(readTextFor(wrong, true).coachCopy).toEqual({ title: false, content: false });
  });

  it('compares the numbers as written, in any order', () => {
    expect(numbersIn('58% of 1,204 putts, 0.4 a round')).toEqual(['58', '1204', '0.4']);
    expect(sameNumbers('58% vs 81%', '81% against 58%')).toBe(true);
    expect(sameNumbers('58% vs 81%', '58% vs 81% over 3')).toBe(false);
  });
});

describe('the coach card from the stored coach copy', () => {
  it('draws the coach copy named for the player, with numbers identical to the player’s card', () => {
    const coach = toChInsight(row(), { tour: PREVIEW_TOUR, viewer: COACH });
    const player = toChInsight(row(), { tour: PREVIEW_TOUR, viewer: ME });
    expect(plain(coach.title)).toBe('Downhill putts from 4–6 ft');
    expect(plain(coach.lede)).toContain('From 4–6 ft, Jonah makes 58% of downhill putts vs 81% of level putts');
    expect(plain(player.title)).toBe('Downhill putts from 4–6 ft: a real penalty');
    expect(plain(player.lede)).toContain('you’re making 58%');
    // Both voices state the same numbers, line by line.
    expect(numbersIn(plain(coach.title))).toEqual(numbersIn(plain(player.title)));
    expect(numbersIn(plain(coach.lede)).sort()).toEqual(numbersIn(plain(player.lede)).sort());
    expect(numbersIn(plain(coach.why ?? '')).sort()).toEqual(numbersIn(plain(player.why ?? '')).sort());
  });

  it('the focus area it assigns is saved in the player’s own words, never the coach copy', () => {
    const coach = toChInsight(row(), { tour: PREVIEW_TOUR, viewer: COACH });
    const without = toChInsight(slope(HELM_PLAYERS.jonah.id), { tour: PREVIEW_TOUR, viewer: COACH });
    expect(coach.assignAs).toEqual(without.assignAs);
    expect(coach.assignAs.description).toContain('you’re making 58%');
  });

  it('without coach copy the card is today’s: the row’s text through the regex', () => {
    const bare = slope(HELM_PLAYERS.jonah.id);
    const card = toChInsight(bare, { tour: PREVIEW_TOUR, viewer: COACH });
    expect(card.title).toBe(speak(bare.title, COACH));
    expect(plain(card.lede)).toContain('Jonah is making 58%');
  });

  it('a coach card for a player with no name on file still reads the coach copy, in neutral third person', () => {
    const card = toChInsight(row(), { tour: PREVIEW_TOUR, engine: { flags: { support: false, cause: false, recheck: false, verdicts: false }, now: '2026-10-21T00:00:00Z', viewer: { role: 'coach', first: 'This player' } } });
    expect(card.title).toBe(SLOPE_COACH_COPY.title);
    expect(card.lede).toContain('the player makes 58%');
  });

  it('the held-back line and the preview read the coach copy too', () => {
    expect(plain(notEnoughRead(row(), COACH).title)).toBe('Downhill putts from 4–6 ft');
    const jonah = PREVIEW_HELM_COACH_COACH_COPY.players.list.find((p) => p.id === HELM_PLAYERS.jonah.id)!;
    expect(plain(jonah.top.title)).toBe('Downhill putts from 4–6 ft');
  });
});
