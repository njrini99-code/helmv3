import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));
vi.mock('@/lib/error-logging', () => ({ logError: vi.fn() }));

import { formatSigned, formatToPar, formatFixed, initials, MINUS, NO_DATA } from '../lib/format';
import { classYearLabel, formStatus } from '../data/home';
import { friendlyReason } from '../lib/use-action';
import { activeNavItem, isRebuilt, rebuiltHref } from '../shell/nav';

describe('format', () => {
  it('writes to-par with E, a true minus and a dash for no data', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(3)).toBe('+3');
    expect(formatToPar(-2)).toBe(`${MINUS}2`);
    expect(formatToPar(-0.44, 1)).toBe(`${MINUS}0.4`);
    expect(formatToPar(0.04, 1)).toBe('E');
    expect(formatToPar(null)).toBe(NO_DATA);
  });
  it('keeps null, zero and signed values distinct', () => {
    expect(formatSigned(null)).toBe(NO_DATA);
    expect(formatSigned(0)).toBe('0.0');
    expect(formatSigned(1.84)).toBe('+1.8');
    expect(formatSigned(-0.9)).toBe(`${MINUS}0.9`);
    expect(formatFixed(undefined)).toBe(NO_DATA);
  });
  it('makes monograms', () => {
    expect(initials('Theo Marchetti')).toBe('TM');
    expect(initials('Priya van der Natarajan')).toBe('PN');
    expect(initials('Cher')).toBe('C');
  });
});

describe('home logic', () => {
  const oct = new Date('2026-10-14T12:00:00Z');
  it('labels class years against the academic year in progress', () => {
    expect(classYearLabel(2027, oct)).toBe('Senior');
    expect(classYearLabel(2030, oct)).toBe('Freshman');
    expect(classYearLabel(2032, oct)).toBe('Class of 2032');
    expect(classYearLabel(null, oct)).toBeNull();
  });
  it('reads form from the newer half against the older half', () => {
    expect(formStatus([72, 73])).toBe('early');
    expect(formStatus([75, 75, 74, 73, 72, 72])).toBe('improving');
    expect(formStatus([72, 72, 73, 74, 75, 74, 75])).toBe('slipping');
    expect(formStatus([72, 72, 71, 72, 71, 71, 72])).toBe('steady');
  });
});

describe('user-facing errors', () => {
  it('passes short readable reasons and hides technical ones', () => {
    expect(friendlyReason('That player already left the team')).toBe('That player already left the team.');
    expect(friendlyReason('duplicate key value violates unique constraint "x"')).toBeNull();
    expect(friendlyReason('PGRST116: JSON object requested')).toBeNull();
    expect(friendlyReason('Not authenticated')).toMatch(/Sign in again/);
    expect(friendlyReason(undefined)).toBeNull();
  });
});

describe('nav', () => {
  it('picks the most specific item and gates unbuilt links', () => {
    expect(activeNavItem('/golf/dashboard')?.id).toBe('home');
    expect(activeNavItem('/golf/dashboard/roster/abc')?.id).toBe('roster');
    expect(isRebuilt('/golf/dashboard/')).toBe(true);
    expect(rebuiltHref('/golf/dashboard/stats?player=1')).toBeNull();
  });
});
