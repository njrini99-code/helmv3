import { describe, it, expect } from 'vitest';
import {
  DEFAULT_COURSE_IMAGES,
  REAL_COURSE_IMAGES,
  resolveDefaultCourseImage,
  resolveRealCourseImage,
  COURSE_IMAGE_CREDITS,
} from '@/lib/golf/course-image-assets';

describe('course-image-assets', () => {
  it('always resolves a default to a bundled path, deterministically', () => {
    const a = resolveDefaultCourseImage('Pinehurst No. 2');
    const b = resolveDefaultCourseImage('Pinehurst No. 2');
    expect(a).toBe(b); // stable per name
    expect(DEFAULT_COURSE_IMAGES).toContain(a);
    // empty / missing name still returns a valid default (never throws/empty)
    expect(DEFAULT_COURSE_IMAGES).toContain(resolveDefaultCourseImage(''));
  });

  it('matches a real-course photo on stored normalized_name', () => {
    expect(resolveRealCourseImage('Pebble Beach Golf Links', 'pebble beach golf links')).toBe(
      '/courses/real/pebble-beach.webp',
    );
    expect(resolveRealCourseImage('Whistling Straits', 'whistling straits')).toBe(
      '/courses/real/whistling-straits.webp',
    );
  });

  it('falls back to normalizing the display name when no normalized_name is given', () => {
    // normalizeName lowercases/trims — "Kiawah Island - Ocean Course" maps directly
    expect(resolveRealCourseImage('Kiawah Island - Ocean Course')).toBe(
      '/courses/real/kiawah-ocean.webp',
    );
  });

  it('returns null for courses with no bundled real photo', () => {
    expect(resolveRealCourseImage('Pinehurst No. 2', 'pinehurst 2')).toBeNull();
    expect(resolveRealCourseImage('Some Local Muni')).toBeNull();
  });

  it('every mapped asset path is web-rooted and webp', () => {
    for (const p of [...DEFAULT_COURSE_IMAGES, ...Object.values(REAL_COURSE_IMAGES)]) {
      expect(p.startsWith('/courses/')).toBe(true);
      expect(p.endsWith('.webp')).toBe(true);
    }
  });

  it('credits cover every bundled file with a license', () => {
    const files = new Set([...DEFAULT_COURSE_IMAGES, ...Object.values(REAL_COURSE_IMAGES)]);
    const credited = new Set(COURSE_IMAGE_CREDITS.map((c) => c.file));
    for (const f of files) expect(credited.has(f)).toBe(true);
    for (const c of COURSE_IMAGE_CREDITS) expect(c.license.length).toBeGreaterThan(0);
  });
});
