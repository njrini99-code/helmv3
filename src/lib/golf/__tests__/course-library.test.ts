import { describe, it, expect } from 'vitest';
import {
  normalizeName,
  namesMatch,
  isTeeComplete,
  sumPar,
  sumYards,
  diffFields,
  mapCourseRow,
  mapTeeRow,
  isCourseImagePublicUrl,
  courseImageExt,
} from '@/lib/golf/course-library';

describe('normalizeName (TS mirror of SQL golf_normalize_name)', () => {
  // This matrix MUST match supabase/tests/rls/golf_course_library.sql §E and the
  // SQL fn in 20260613160100_course_library_normalize_fix.sql.
  it('collapses every "Pinehurst N" spelling to one dedup key', () => {
    for (const v of [
      'Pinehurst No. 2',
      'Pinehurst No.2',
      'Pinehurst #2',
      'Pinehurst Number 2',
      'Pinehurst 2',
      '  PINEHURST   No.  2  ',
    ]) {
      expect(normalizeName(v)).toBe('pinehurst 2');
    }
  });

  it('does NOT strip "No" out of real words like "Northwood"', () => {
    expect(normalizeName('Northwood Country Club')).toBe('northwood country club');
  });

  it('strips a bare word "No" (no dot)', () => {
    expect(normalizeName('Mauna Kea No 1')).toBe('mauna kea 1');
    expect(normalizeName('Course Number 7')).toBe('course 7');
  });

  it('strips "#" anywhere and collapses whitespace', () => {
    expect(normalizeName('TPC #18 Course')).toBe('tpc 18 course');
  });

  it('handles null/empty/whitespace', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
    expect(normalizeName('   ')).toBe('');
  });

  it('preserves distinct facilities (no false collisions)', () => {
    expect(normalizeName('TPC Sawgrass')).not.toBe(normalizeName('TPC Sawgrass - Stadium'));
  });
});

describe('namesMatch', () => {
  it('matches across normalization', () => {
    expect(namesMatch('Pinehurst No. 2', 'pinehurst #2')).toBe(true);
  });
  it('never matches when normalized form is empty', () => {
    expect(namesMatch('', '')).toBe(false);
    expect(namesMatch('No.', '#')).toBe(false); // both normalize to ''
  });
  it('does not match different facilities', () => {
    expect(namesMatch('Pebble Beach', 'Pinehurst No. 2')).toBe(false);
  });
});

describe('isTeeComplete', () => {
  const full18 = Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: 4 }));
  const full9 = Array.from({ length: 9 }, (_, i) => ({ hole_number: i + 1, par: 4 }));

  it('accepts a full, valid 18-hole set', () => {
    expect(isTeeComplete(18, full18)).toBe(true);
  });
  it('accepts a full 9-hole set', () => {
    expect(isTeeComplete(9, full9)).toBe(true);
  });
  it('rejects a short set (missing a hole)', () => {
    expect(isTeeComplete(18, full18.slice(0, 17))).toBe(false);
  });
  it('rejects a duplicate hole_number', () => {
    const dup = [...full18.slice(0, 17), { hole_number: 17, par: 4 }];
    expect(isTeeComplete(18, dup)).toBe(false);
  });
  it('rejects out-of-range par', () => {
    const bad = [{ hole_number: 1, par: 9 }, ...full18.slice(1)];
    expect(isTeeComplete(18, bad)).toBe(false);
  });
  it('rejects an invalid holes_count', () => {
    expect(isTeeComplete(12, full18)).toBe(false);
  });
});

describe('sumPar / sumYards', () => {
  it('sums par, returns null on empty', () => {
    expect(sumPar([{ par: 4 }, { par: 3 }, { par: 5 }])).toBe(12);
    expect(sumPar([])).toBeNull();
  });
  it('sums only present yardages, null when none', () => {
    expect(sumYards([{ yardage: 400 }, { yardage: null }, { yardage: 350 }])).toBe(750);
    expect(sumYards([{ yardage: null }, { yardage: null }])).toBeNull();
  });
});

describe('diffFields', () => {
  const before = { name: 'Old', city: 'A', state: null as string | null };
  it('reports only changed allow-listed fields', () => {
    expect(diffFields(before, { name: 'New', city: 'A' }, ['name', 'city'])).toEqual({
      name: { from: 'Old', to: 'New' },
    });
  });
  it('returns null when nothing changed', () => {
    expect(diffFields(before, { name: 'Old' }, ['name', 'city'])).toBeNull();
  });
  it('ignores undefined (omitted) fields', () => {
    expect(diffFields(before, { name: undefined }, ['name'])).toBeNull();
  });
  it('captures a null transition', () => {
    expect(diffFields(before, { state: 'NC' }, ['state'])).toEqual({
      state: { from: null, to: 'NC' },
    });
  });
  it('only considers allow-listed fields', () => {
    // a change to a non-allow-listed field is ignored
    expect(diffFields(before, { city: 'B' }, ['name'])).toBeNull();
  });
});

describe('row mappers', () => {
  it('mapCourseRow fills legacy aspirational fields + cloud columns', () => {
    const row = {
      id: 'c1', name: 'Pinehurst No. 2', city: 'Pinehurst', state: 'NC',
      par: 72, course_rating: 75.1, slope_rating: 138, created_at: 't0',
      normalized_name: 'pinehurst 2', deleted_at: null, created_by_user_id: 'u1',
    };
    const c = mapCourseRow(row);
    expect(c.id).toBe('c1');
    expect(c.total_par).toBe(72);
    expect(c.normalized_name).toBe('pinehurst 2');
    expect(c.created_by).toBe('u1');
    expect(c.default_tee_name).toBeNull(); // legacy field, always null in cloud model
    expect(c.is_public).toBe(true);
  });

  it('mapTeeRow coerces is_draft to a real boolean and defaults holes_count', () => {
    const t = mapTeeRow({ id: 't1', course_id: 'c1', tee_name: 'Blue', normalized_tee_name: 'blue', is_draft: 0 });
    expect(t.is_draft).toBe(false);
    expect(t.holes_count).toBe(18);
    expect(t.tee_name).toBe('Blue');
  });
});

describe('courseImageExt', () => {
  it('maps each supported mime to its canonical extension', () => {
    expect(courseImageExt('image/jpeg')).toBe('jpg');
    expect(courseImageExt('image/png')).toBe('png');
    expect(courseImageExt('image/webp')).toBe('webp');
    expect(courseImageExt('image/avif')).toBe('avif');
  });
  it('defaults to jpg for an unknown / empty mime', () => {
    expect(courseImageExt('image/gif')).toBe('jpg');
    expect(courseImageExt('application/octet-stream')).toBe('jpg');
    expect(courseImageExt('')).toBe('jpg');
  });
});

describe('isCourseImagePublicUrl (image_url anti-spoofing guard)', () => {
  const base = 'https://qmnssrrolpinvwjjnufo.supabase.co';
  const ok = `${base}/storage/v1/object/public/course-images/abc/cover.jpg`;

  it('accepts a public URL we minted in our own course-images bucket', () => {
    expect(isCourseImagePublicUrl(ok, base)).toBe(true);
  });
  it('rejects an arbitrary external URL', () => {
    expect(isCourseImagePublicUrl('https://evil.example.com/pic.jpg', base)).toBe(false);
    expect(isCourseImagePublicUrl('https://qmnssrrolpinvwjjnufo.supabase.co.evil.com/x', base)).toBe(false);
  });
  it('rejects a URL pointed at a different bucket or a private path', () => {
    expect(isCourseImagePublicUrl(`${base}/storage/v1/object/public/avatars/x.jpg`, base)).toBe(false);
    expect(isCourseImagePublicUrl(`${base}/storage/v1/object/course-images/x.jpg`, base)).toBe(false);
    expect(isCourseImagePublicUrl(`${base}/storage/v1/object/sign/course-images/x.jpg`, base)).toBe(false);
  });
  it('rejects when either argument is empty (never trusts a blank base)', () => {
    expect(isCourseImagePublicUrl('', base)).toBe(false);
    expect(isCourseImagePublicUrl(ok, '')).toBe(false);
    expect(isCourseImagePublicUrl('/storage/v1/object/public/course-images/x.jpg', '')).toBe(false);
  });
});
