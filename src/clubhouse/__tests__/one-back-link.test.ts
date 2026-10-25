import { describe, expect, it } from 'vitest';
import { hits, walk } from './_scan';

/**
 * CONS-29: one desktop back, ui/Section BackLink (a link to the parent, or a button that steps back inside a page); the
 * phone's is PhoneBar. Round setup's band back (it sits on the dark band), onboarding's back and the two raw pagers are
 * held for a visual decision and listed here; the list only shrinks.
 */
const HELD = ['ch-rsu-band__back', 'ch-ox-back', 'ch-hw-pager', 'ch-ph-pg'];

describe('one back link (CONS-29)', () => {
  const src = walk(undefined, /\.(tsx|css)$/);
  it('the CoachHelm, calendar and course-picker backs are BackLink', () => {
    expect(hits(/ch-(htr|hmb|rsu)-back\b|ch-in__back\b/, src)).toEqual([]);
  });
  it('no other hand-rolled back appears', () => {
    const found = hits(/ch-(rsu-band_|ox|in_)_?-?back\b|ch-hw-pager|ch-ph-pg/, src).map((h) => h.text.match(/ch-[\w-]*(?:back|pager|pg)\b/)?.[0]);
    expect([...new Set(found)].filter((c) => c && !HELD.includes(c))).toEqual([]);
  });
});
