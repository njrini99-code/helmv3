import { describe, it, expect } from 'vitest';
import {
  parseActivityFilters,
  kindChipHref,
  teamFilterHref,
  loadMoreHref,
  searchParamsToURLSearchParams,
} from '../filters';

describe('parseActivityFilters', () => {
  it('parses a known type + team + cursor', () => {
    expect(parseActivityFilters({ type: 'round_submitted', team: 't1', cursor: '2026-07-01T00:00:00Z' })).toEqual({
      type: 'round_submitted',
      teamId: 't1',
      cursor: '2026-07-01T00:00:00Z',
    });
  });

  it('drops an unknown type instead of throwing', () => {
    expect(parseActivityFilters({ type: 'not_a_real_kind' })).toEqual({
      type: null,
      teamId: null,
      cursor: null,
    });
  });

  it('treats empty/missing values as no filter', () => {
    expect(parseActivityFilters({})).toEqual({ type: null, teamId: null, cursor: null });
    expect(parseActivityFilters({ team: '', cursor: '' })).toEqual({ type: null, teamId: null, cursor: null });
  });

  it('ignores array-shaped values (never multi-value for these params)', () => {
    expect(parseActivityFilters({ type: ['round_submitted', 'error'] })).toEqual({
      type: null,
      teamId: null,
      cursor: null,
    });
  });
});

describe('kindChipHref', () => {
  it('sets the type param and clears any stale cursor', () => {
    const current = new URLSearchParams({ team: 't1', cursor: 'stale' });
    expect(kindChipHref(current, 'error')).toBe('/admin/activity?team=t1&type=error');
  });

  it('"all" clears the type param', () => {
    const current = new URLSearchParams({ type: 'error', team: 't1' });
    expect(kindChipHref(current, 'all')).toBe('/admin/activity?team=t1');
  });

  it('collapses to the bare path when no params remain', () => {
    const current = new URLSearchParams({ type: 'error' });
    expect(kindChipHref(current, 'all')).toBe('/admin/activity');
  });
});

describe('teamFilterHref', () => {
  it('sets the team param and clears any stale cursor', () => {
    const current = new URLSearchParams({ type: 'error', cursor: 'stale' });
    expect(teamFilterHref(current, 't2')).toBe('/admin/activity?type=error&team=t2');
  });

  it('null clears the team param', () => {
    const current = new URLSearchParams({ type: 'error', team: 't2' });
    expect(teamFilterHref(current, null)).toBe('/admin/activity?type=error');
  });
});

describe('loadMoreHref', () => {
  it('sets/overwrites the cursor while preserving other filters', () => {
    const current = new URLSearchParams({ type: 'error', team: 't1', cursor: 'old' });
    expect(loadMoreHref(current, 'new-cursor')).toBe('/admin/activity?type=error&team=t1&cursor=new-cursor');
  });
});

describe('searchParamsToURLSearchParams', () => {
  it('keeps only string-valued entries', () => {
    const usp = searchParamsToURLSearchParams({ type: 'error', team: undefined, weird: ['a', 'b'] });
    expect(usp.toString()).toBe('type=error');
  });
});
