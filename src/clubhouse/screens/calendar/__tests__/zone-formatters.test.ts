import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { letterDate } from '../../messages/announcements';
import { daylightOn, zonedNow } from '../model';

/**
 * F-0010 (route-switch frame cost): the week grid asks for the light of each day it shows and the page for the team's "now" on every
 * tick, and the announcement letterhead dates every letter. A date formatter is expensive to build, so each kind is built once per zone
 * and reused: the values are the ones they always were, and a hundred days build no more formatters than one does.
 */

const Real = Intl.DateTimeFormat;
const ZONE = 'America/New_York';
let built = 0;

beforeEach(() => {
  built = 0;
  class Counting extends Real {
    constructor(...args: ConstructorParameters<typeof Real>) {
      super(...args);
      built += 1;
    }
  }
  Intl.DateTimeFormat = Counting as unknown as typeof Intl.DateTimeFormat;
});
afterEach(() => {
  Intl.DateTimeFormat = Real;
});

const PLACE = { lat: 38.9, lng: -78.5 };
const day = (i: number) => new Date(Date.UTC(2026, 10, 1 + i, 12)).toISOString().slice(0, 10);

describe('F-0010 the Calendar reuses its formatters', () => {
  it('daylightOn builds no formatter after the first day, however many days follow', () => {
    daylightOn(day(0), PLACE, ZONE);
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    for (let i = 1; i <= 60; i++) daylightOn(day(i), PLACE, ZONE);
    expect(built).toBe(afterFirst);
  });

  it('zonedNow builds nothing after its first call', () => {
    zonedNow(ZONE, new Date('2026-11-13T15:00:00Z'));
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) zonedNow(ZONE, new Date(Date.parse('2026-11-13T15:00:00Z') + i * 60_000));
    expect(built).toBe(afterFirst);
  });

  it('says what it always said', () => {
    expect(zonedNow(ZONE, new Date('2026-11-13T15:30:00Z'))).toEqual({ date: '2026-11-13', hour: 10.5, ms: Date.parse('2026-11-13T15:30:00Z') });
    // Midnight is hour 0, never 24 (the h23 cycle).
    expect(zonedNow(ZONE, new Date('2026-11-13T05:00:00Z')).hour).toBe(0);
    expect(zonedNow('Asia/Tokyo', new Date('2026-11-13T15:30:00Z')).date).toBe('2026-11-14');
    const light = daylightOn('2026-11-13', PLACE, ZONE);
    expect(light.rise).toBeGreaterThan(6);
    expect(light.rise).toBeLessThan(8);
    expect(light.set).toBeGreaterThan(16);
    expect(light.set).toBeLessThan(18);
    expect(light.golden).toBeLessThan(light.set!);
  });

  it('an unknown zone fails as it always did, every time', () => {
    expect(() => zonedNow('Not/AZone', new Date())).toThrow(RangeError);
    expect(() => zonedNow('Not/AZone', new Date())).toThrow(RangeError);
  });
});

describe('F-0010 the announcement letterhead reuses its formatters', () => {
  it('builds no formatter after the first letters', () => {
    letterDate('2026-10-14T15:00:00Z', ZONE);
    letterDate('2019-03-05T15:00:00Z', ZONE);
    const afterFirst = built;
    expect(afterFirst).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) {
      letterDate(new Date(Date.UTC(2026, 0, 1 + i, 15)).toISOString(), ZONE);
      letterDate(new Date(Date.UTC(2019, 0, 1 + i, 15)).toISOString(), ZONE);
    }
    expect(built).toBe(afterFirst);
  });

  it('says what it always said: the year only when it is not this one', () => {
    expect(letterDate('2019-03-05T15:00:00Z', ZONE)).toBe('Tuesday 5 March 2019');
    const thisYear = new Date().getUTCFullYear();
    expect(letterDate(`${thisYear}-06-17T15:00:00Z`, ZONE)).toMatch(/^\w+ 17 June$/);
  });
});
