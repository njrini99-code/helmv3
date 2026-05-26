/**
 * W38 — Practice Rx parser tests.
 *
 * The composer talks to Supabase + the LLM gateway; the parser is the
 * pure part most worth locking down. A drift in line format here means
 * the day-by-day cards stay empty even when the model returns valid
 * text — silently breaks the feature.
 */

import { describe, it, expect } from 'vitest';
import { parsePlan } from '@/lib/coachhelm/v3/practice-rx/composer';

const CANDIDATE_IDS = new Set([
  '11111111-1111-4111-9111-111111111111',
  '22222222-2222-4222-9222-222222222222',
  '33333333-3333-4333-9333-333333333333',
]);

describe('parsePlan', () => {
  it('parses a clean 7-line response', () => {
    const text = [
      'Day 1: drill_ids=11111111-1111-4111-9111-111111111111 — Focus on tempo.',
      'Day 2: drill_ids=22222222-2222-4222-9222-222222222222 — Distance control.',
      'Day 3: drill_ids=11111111-1111-4111-9111-111111111111,22222222-2222-4222-9222-222222222222 — Combo block.',
      'Day 4: drill_ids=33333333-3333-4333-9333-333333333333 — Long lag.',
      'Day 5: drill_ids=22222222-2222-4222-9222-222222222222 — Refine.',
      'Day 6: drill_ids=11111111-1111-4111-9111-111111111111 — Tempo block.',
      'Day 7: drill_ids=33333333-3333-4333-9333-333333333333 — Tournament prep.',
    ].join('\n');
    const days = parsePlan(text, CANDIDATE_IDS);
    expect(days).toHaveLength(7);
    expect(days[0]?.day).toBe(1);
    expect(days[2]?.drill_ids).toHaveLength(2);
  });

  it('drops drill ids that are not in the candidate set (anti-hallucination)', () => {
    const text =
      'Day 1: drill_ids=11111111-1111-4111-9111-111111111111,not-a-real-id — Drill block.';
    const days = parsePlan(text, CANDIDATE_IDS);
    expect(days).toHaveLength(1);
    expect(days[0]?.drill_ids).toEqual([
      '11111111-1111-4111-9111-111111111111',
    ]);
  });

  it('skips lines with zero valid drill ids', () => {
    const text =
      'Day 1: drill_ids=fake-1,fake-2 — All fabricated.\nDay 2: drill_ids=11111111-1111-4111-9111-111111111111 — Real.';
    const days = parsePlan(text, CANDIDATE_IDS);
    expect(days).toHaveLength(1);
    expect(days[0]?.day).toBe(2);
  });

  it('skips out-of-range day numbers', () => {
    const text =
      'Day 9: drill_ids=11111111-1111-4111-9111-111111111111 — Out of range.\nDay 3: drill_ids=11111111-1111-4111-9111-111111111111 — In range.';
    const days = parsePlan(text, CANDIDATE_IDS);
    expect(days).toHaveLength(1);
    expect(days[0]?.day).toBe(3);
  });

  it('returns an empty array for unparseable text', () => {
    expect(parsePlan('Sorry I can\'t help.', CANDIDATE_IDS)).toEqual([]);
  });

  it('sorts days by ascending number', () => {
    const text =
      'Day 5: drill_ids=11111111-1111-4111-9111-111111111111 — Five.\nDay 1: drill_ids=11111111-1111-4111-9111-111111111111 — One.';
    const days = parsePlan(text, CANDIDATE_IDS);
    expect(days.map((d) => d.day)).toEqual([1, 5]);
  });
});
