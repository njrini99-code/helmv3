import { describe, expect, it } from 'vitest';
import { changeLines, diffVersions } from '@/lib/coachhelm/v3/practice-plan/model';
import { PP_PLAN_PART } from '../../../preview/fixtures-practice-plan';

const body = PP_PLAN_PART.draft.body;
const start = new Date('2026-11-05T19:00:00Z');

describe('What changed on Republish (N-00 4.11)', () => {
  it('lists a move in words and names who it reaches', () => {
    const next = { ...body, variants: { ...body.variants, main: { blocks: body.variants.main.blocks.map((b, i) => (i === 0 ? { ...b, len: b.len + 10 } : b)) } } };
    const diff = diffVersions(body, next, start, 'America/New_York');
    expect(diff.wordingOnly).toBe(false);
    expect(diff.affected.length).toBe(body.players.length);
    expect(changeLines(diff).some((l) => /moved to/.test(l))).toBe(true);
  });
  it('tells nobody about wording', () => {
    const next = { ...body, notes: 'Bring water.' };
    expect(diffVersions(body, next, start, 'America/New_York').wordingOnly).toBe(true);
  });
});
