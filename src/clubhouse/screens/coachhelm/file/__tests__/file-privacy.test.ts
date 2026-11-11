import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIELD_PLAYER_FLOOR, toChFileField } from '../../../../data/coachhelm-file-shape';
import { playerCards } from '../../../../data/coachhelm-file';

/**
 * What a player may be handed (WORKER_RULES "Players never see a teammate's figures or a coach-only field: absent from the DOM and
 * from what the loader returns, not hidden with CSS"). These run on the real shaping functions the routes call, so a change that lets
 * a coach-only value into the player's payload fails here, before any screen draws it.
 */
type Entry = Parameters<typeof toChFileField>[0];
const entry = (field_n: number): Entry => ({ field_n, field_mean: 2.4, relative: -1.6 }) as Entry;
const round = { date: '2026-10-26', course: 'Lonnie Poole', score: 73 };
// Teammates' per-18 figures on the day: distinctive, so finding one in a payload is unambiguous.
const TEAMMATES = [5.137, 7.291, 3.463, 9.812];

describe('the field card, as a player is handed it', () => {
  it(`is nothing at all under ${FIELD_PLAYER_FLOOR} players: no card to draw, so no small field can name a teammate`, () => {
    for (let n = 1; n < FIELD_PLAYER_FLOOR; n += 1) expect(toChFileField(entry(n), TEAMMATES, { role: 'player' }, round, 'America/New_York')).toBeNull();
    // The coach, who may see the day whatever its size, still gets a card.
    expect(toChFileField(entry(FIELD_PLAYER_FLOOR - 1), TEAMMATES, { role: 'coach', first: 'Eli' }, round, 'America/New_York')).not.toBeNull();
  });

  it('at the floor and above carries the player’s own figure, the field’s average and no teammate’s value anywhere in it', () => {
    const card = toChFileField(entry(FIELD_PLAYER_FLOOR), TEAMMATES, { role: 'player' }, round, 'America/New_York')!;
    expect(card).not.toBeNull();
    expect(card.dots).toBeNull();
    expect(card.me).toBeCloseTo(0.8);
    expect(card.mean).toBe(2.4);
    const sent = JSON.stringify(card);
    for (const v of TEAMMATES) expect(sent).not.toContain(String(v));
    // The strip's ends come from the player and the mean alone: a teammate's 9.8 can't be read back off the scale.
    expect(card.scale[1]).toBeLessThan(9);
  });

  it('the same day for the coach does carry the others, as bare numbers: the difference is the role, not a style', () => {
    const card = toChFileField(entry(FIELD_PLAYER_FLOOR), TEAMMATES, { role: 'coach', first: 'Eli' }, round, 'America/New_York')!;
    expect(card.dots).toEqual([...TEAMMATES].sort((a, b) => a - b));
  });
});

describe('the cards a player, or a coach looking through the player’s lens, is handed', () => {
  it('have no key for the coach’s plan for the player or the coach’s track record, and never a read the coach dismissed', () => {
    const cards = playerCards([], []);
    for (const key of ['intent', 'track']) expect(Object.keys(cards)).not.toContain(key);
    // The key exists so the card type is whole; for a player it is always empty (a coach's dismissals are the coach's).
    expect(cards.dismissed).toEqual([]);
  });

  it('the player’s own route builds its cards from the player set and asks for the field as a player', () => {
    const src = readFileSync(join(process.cwd(), 'src/clubhouse/data/coachhelm-file.ts'), 'utf8');
    const own = src.slice(src.indexOf('export async function loadPlayerYourWeek'));
    expect(own.length).toBeGreaterThan(200);
    expect(own).toMatch(/loadFileField\([^)]*\{ role: 'player' \}/);
    expect(own).not.toMatch(/loadFileIntent|loadFileTrack|role: 'coach'/);
    expect(own).toMatch(/const cards: ChFileCards = \{ \.\.\.playerCards\(list, rows\), sg, plan, field: field \?\? null \};/);
  });
});
