import { describe, expect, it } from 'vitest';
import { formatAvg, formatDistance, formatFixed, formatHcp, formatPct, formatSG, formatSigned, formatToPar, MINUS, NO_DATA, toParWords, trueMinus } from '../format';
import { plural } from '../plural';

describe('one number voice', () => {
  it('a signed delta carries an explicit plus, a true minus, and no sign on zero', () => {
    expect(formatSigned(1.84)).toBe('+1.8');
    expect(formatSigned(-0.94)).toBe(`${MINUS}0.9`);
    expect(formatSigned(0.02)).toBe('0.0');
    expect(formatSigned(-0.02)).toBe('0.0');
    expect(formatSigned(0, 0)).toBe('0');
    expect(formatSigned(3, 0)).toBe('+3');
    expect(formatSigned(-2, 0)).toBe(`${MINUS}2`);
  });

  it('even par is E at any precision, and under par is a true minus', () => {
    expect(formatToPar(0)).toBe('E');
    expect(formatToPar(0.04, 1)).toBe('E');
    expect(formatToPar(2)).toBe('+2');
    expect(formatToPar(-1.6, 1)).toBe(`${MINUS}1.6`);
  });

  it('no data is an em dash, never a zero', () => {
    expect(formatSigned(null)).toBe(NO_DATA);
    expect(formatToPar(undefined)).toBe(NO_DATA);
    expect(formatFixed(NaN)).toBe(NO_DATA);
    expect(formatPct(null)).toBe(NO_DATA);
    expect(formatPct(0)).toBe('0%');
  });

  it('a percentage is a whole number unless asked', () => {
    expect(formatPct(61.4)).toBe('61%');
    expect(formatPct(61.5)).toBe('62%');
    expect(formatPct(88.46, 1)).toBe('88.5%');
  });

  it('one precision per metric (CONS-15); strokes gained at one decimal (owner decision 11)', () => {
    expect(formatSG(0.844)).toBe('+0.8');
    expect(formatSG(-1.2)).toBe(`${MINUS}1.2`);
    expect(formatSG(0.001)).toBe('0.0');
    expect(formatSG(-0.04)).toBe('0.0');
    expect(formatHcp(-1.2)).toBe('+1.2');
    expect(formatHcp(4)).toBe('4.0');
    expect(formatHcp(-0.04)).toBe('0.0');
    expect(formatHcp(null)).toBe(NO_DATA);
    expect(formatAvg(72.44)).toBe('72.4');
    expect(formatAvg(undefined)).toBe(NO_DATA);
    expect(formatPct(56.4)).toBe('56%');
    expect(formatToPar(0)).toBe('E');
    expect(formatDistance(152.4)).toBe('152 yds');
    expect(formatDistance(8.46, 'ft', 1)).toBe('8.5 ft');
    expect(formatDistance(null)).toBe(NO_DATA);
  });

  it('a plain figure uses the true minus too, never a hyphen or a negative zero (L-043)', () => {
    expect(formatFixed(-4.8)).toBe(`${MINUS}4.8`);
    expect(formatFixed(-0.04)).toBe('0.0');
    expect(formatFixed(-1.7, 2)).toBe(`${MINUS}1.70`);
    expect(formatPct(-3.2, 1)).toBe(`${MINUS}3.2%`);
    expect(formatDistance(-4, 'ft')).toBe(`${MINUS}4 ft`);
    expect(trueMinus('-12.5')).toBe(`${MINUS}12.5`);
    expect(trueMinus('-0')).toBe('0');
    expect(trueMinus('3.0')).toBe('3.0');
  });

  it('a count over a thousand is grouped: 1,801 putts (L-043)', () => {
    expect(plural(1801, 'putt')).toBe('1,801 putts');
    expect(plural(999, 'putt')).toBe('999 putts');
    expect(plural(1, 'putt')).toBe('1 putt');
  });

  it('a score against par in words is one phrasing (L-045)', () => {
    expect([-2, 0, 3].map((v) => toParWords(v))).toEqual(['2 under par', 'even par', '3 over par']);
    expect(toParWords(null)).toBe('no score yet');
    expect([-2, 0, 3].map((v) => toParWords(v, { short: true }))).toEqual(['2 under', 'even', '3 over']);
  });
});
