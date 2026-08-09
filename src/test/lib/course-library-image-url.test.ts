import { describe, it, expect } from 'vitest';
import { isCourseImagePublicUrl } from '@/lib/golf/course-library';

/**
 * A real coach hit "Invalid image URL" in production on 2026-08-09 after the
 * file had ALREADY been stored — the upload succeeded and only the check on the
 * way back failed, so they saw a red toast for a photo that existed.
 *
 * The URL being checked comes from supabase-js `getPublicUrl()` in the BROWSER;
 * the prefix is built on the SERVER from `NEXT_PUBLIC_SUPABASE_URL`. Those are
 * two independent reads of the same setting, so a trailing slash on either —
 * one character, invisible in a dashboard — rejected every legitimate upload.
 */
const BASE = 'https://qmnssrrolpinvwjjnufo.supabase.co';
const GOOD = `${BASE}/storage/v1/object/public/course-images/courses/abc/def.jpg`;

describe('isCourseImagePublicUrl', () => {
  it('accepts a public URL from our own bucket', () => {
    expect(isCourseImagePublicUrl(GOOD, BASE)).toBe(true);
  });

  it('accepts it when the configured base carries a trailing slash', () => {
    // The failure mode this fix exists for.
    expect(isCourseImagePublicUrl(GOOD, `${BASE}/`)).toBe(true);
    expect(isCourseImagePublicUrl(GOOD, `${BASE}///`)).toBe(true);
  });

  it('still rejects an arbitrary external URL', () => {
    // The whole point of the predicate — normalising must not widen it.
    expect(isCourseImagePublicUrl('https://evil.example.com/x.jpg', BASE)).toBe(false);
    expect(isCourseImagePublicUrl(`https://evil.example.com${BASE}/storage/v1/object/public/course-images/x.jpg`, BASE)).toBe(false);
  });

  it('still rejects another bucket in our own project', () => {
    expect(
      isCourseImagePublicUrl(`${BASE}/storage/v1/object/public/avatars/x.jpg`, BASE),
    ).toBe(false);
  });

  it('rejects when the env var is missing rather than accepting everything', () => {
    // An empty base must never normalise into a prefix that matches anything.
    expect(isCourseImagePublicUrl(GOOD, '')).toBe(false);
    expect(isCourseImagePublicUrl(GOOD, '/')).toBe(false);
  });
});
