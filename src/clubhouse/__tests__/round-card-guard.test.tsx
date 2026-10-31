import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

import { RoundCard, roundCardLine, roundCardName, type ChRoundCardData } from '../screens/tournaments/RoundCard';

/**
 * P-5 4.11.4: the round card, and the owner's rule that no card carries a thick left accent (a side bar). The guard reads
 * the card's stylesheet: a left border wider than 1px, or an inset shadow with an x offset and no y offset (a painted
 * side bar), fails; a full hairline and the resting elevation (`--ch-elevation-reading`) pass.
 */

const card = (over: Partial<ChRoundCardData> = {}): ChRoundCardData => ({ roundNo: 1, date: '2026-11-05', tee: '08:42', startType: 'tee_times', status: 'upcoming', course: 'Pinehurst No. 2', href: '/golf/dashboard/tournaments/t1', ...over });

/** Every declaration a selector matching `prefix` sets, from plain CSS (media blocks included). */
function declarationsFor(css: string, prefix: string): string[] {
  const out: string[] = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1]!.includes(prefix)) continue;
    out.push(...m[2]!.split(';').map((d) => d.trim()).filter(Boolean));
  }
  return out;
}

/** A side bar: border-left wider than 1px, or an inset shadow offset on x alone. */
function sideBarViolations(decls: readonly string[]): string[] {
  const px = (v: string) => (/^(-?\d*\.?\d+)px$/.exec(v) ? Math.abs(parseFloat(v)) : v === '0' ? 0 : NaN);
  return decls.filter((d) => {
    const [prop, ...rest] = d.split(':');
    const value = rest.join(':').trim();
    const p = prop!.trim();
    if (p === 'border-left-width' || p === 'border-inline-start-width') return px(value) > 1;
    if (p === 'border-left' || p === 'border-inline-start') return value.split(/\s+/).some((t) => px(t) > 1);
    if (p === 'box-shadow') {
      return value.split(/,(?![^(]*\))/).some((layer) => {
        const t = layer.trim().split(/\s+/);
        if (t[0] !== 'inset') return false;
        const x = px(t[1] ?? '');
        const y = px(t[2] ?? '');
        return x > 1 && y === 0;
      });
    }
    return false;
  });
}

afterEach(cleanup);

describe('P-5 RoundCard', () => {
  it('the guard catches a side bar and passes a hairline and the reading elevation', () => {
    expect(sideBarViolations(['border-left: 3px solid var(--accent)'])).toHaveLength(1);
    expect(sideBarViolations(['border-left-width: 4px'])).toHaveLength(1);
    expect(sideBarViolations(['box-shadow: inset 3px 0 0 var(--ch-green-600)'])).toHaveLength(1);
    expect(sideBarViolations(['box-shadow: 0 1px 2px rgb(0 0 0 / 0.1), inset 4px 0 0 green'])).toHaveLength(1);
    expect(sideBarViolations(['border: var(--ch-hairline-w) solid var(--ch-border-hairline)', 'box-shadow: var(--ch-elevation-reading)', 'border-left: 1px solid red'])).toEqual([]);
    const tokens = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tokens.css'), 'utf8');
    const reading = [...tokens.matchAll(/--ch-elevation-reading:\s*([^;]+);/g)].map((m) => `box-shadow: ${m[1]!.replace(/\s+/g, ' ')}`);
    expect(reading.length).toBeGreaterThan(0);
    expect(sideBarViolations(reading)).toEqual([]);
  });

  it('no round card rule draws a side bar', () => {
    const css = readFileSync(join(process.cwd(), 'src/clubhouse/styles/tournament-fields.css'), 'utf8');
    const decls = declarationsFor(css, '.ch-tfx-card');
    expect(decls.length).toBeGreaterThan(10);
    expect(sideBarViolations(decls)).toEqual([]);
    expect(decls).toContain('box-shadow: var(--ch-elevation-reading)');
  });

  it('every status reads in a word, and the whole card is one link with a spoken name', () => {
    for (const [status, word] of [['upcoming', 'Upcoming'], ['live', 'Live'], ['suspended', 'Suspended'], ['final', 'Final'], ['cancelled', 'Cancelled']] as const) {
      render(<RoundCard round={card({ status })} />);
      const link = screen.getByRole('link');
      expect(link.getAttribute('data-status')).toBe(status);
      expect(link.textContent).toContain(word);
      cleanup();
    }
    render(<RoundCard round={card()} />);
    expect(screen.getByRole('link', { name: 'Round 1, Thursday 5 November, Pinehurst No. 2, first tee 8:42 AM, upcoming' }).getAttribute('href')).toBe('/golf/dashboard/tournaments/t1');
  });

  it('a cancelled card leads its status with Ban and has no status dot', () => {
    render(<RoundCard round={card({ status: 'cancelled' })} />);
    const link = screen.getByRole('link');
    expect(link.querySelector('.ch-tfx-card__dot')).toBeNull();
    expect(link.querySelector('.ch-tfx-card__status svg')).not.toBeNull();
    expect(link.querySelector('.ch-tfx__plate')?.textContent).toBe('R1');
  });

  it('the second line says how it starts', () => {
    expect(roundCardLine({ tee: '08:42', startType: 'tee_times' })).toBe('Tee times · first tee 8:42 AM');
    expect(roundCardLine({ tee: '08:00', startType: 'shotgun' })).toBe('Shotgun at 8:00 AM');
    expect(roundCardLine({ tee: '08:00', startType: 'two_tees' })).toBe('1 and 10 · first tee 8:00 AM');
    expect(roundCardLine({ tee: null, startType: 'tee_times' })).toBe('Time not set');
    expect(roundCardName(card({ tee: null, course: null }))).toBe('Round 1, Thursday 5 November, time not set, upcoming');
  });
});
