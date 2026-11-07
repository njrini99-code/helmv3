import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { teamDateLabel } from '../../../lib/team-date';
import { DeskAgenda, DeskBoard } from '../HomeDeskCrh';
import { changeInWords, homeSubline } from '../model';

vi.mock('../../../shell/nav', () => ({ rebuiltHref: (h: string) => h }));

const src = (file: string) => readFileSync(join(process.cwd(), 'src/clubhouse', file), 'utf8');
const row = (id: string, title: string, isNext = false) => ({ id, title, timeLabel: '2:00 PM', detail: 'Rec Center', isNext }) as never;
const leader = (name: string, rounds: number, avg: number, status = 'early') => ({ playerId: name, name, rounds, avg, status }) as never;

describe('Coach Home, the owner pass', () => {
  it('an event shows once: This week leaves out the one in the hero (HOME-S3)', () => {
    render(<DeskAgenda rows={[row('hero', 'Spring Preview'), row('b', 'Team lift')]} heroId="hero" />);
    expect(screen.queryByText('Spring Preview')).toBeNull();
    expect(screen.getByText('Team lift')).toBeTruthy();
  });

  it('an empty week is one line and one shape, with no strip (HOME-S2)', () => {
    const { container } = render(<DeskAgenda rows={[row('hero', 'Spring Preview')]} heroId="hero" />);
    expect(screen.getByText('Nothing else on the calendar this week.')).toBeTruthy();
    expect(container.querySelectorAll('.ch-es-shape__u')).toHaveLength(1);
    expect(container.querySelector('.ch-wks')).toBeNull();
    expect(container.querySelector('.ch-es')).toBeNull();
  });

  it('an early read has a dash for its rank, says its rounds, and the board names its window (HOME-S6, S8)', () => {
    const { container } = render(<DeskBoard rows={[leader('Cole Bennett', 2, 70.5)]} rosterSize={6} years={{ 'Cole Bennett': 'jr' }} />);
    expect(container.querySelector('.ch-dh-rank')!.textContent).toBe('—');
    expect(screen.getByText('2 rounds')).toBeTruthy();
    expect(screen.getByText(/Season average, 18-hole rounds/)).toBeTruthy();
    expect(container.querySelector('.ch-dh-coin')!.getAttribute('data-year')).toBe('jr');
  });

  it('the change is in words (HOME-S7)', () => {
    expect(changeInWords(0.5, 'previous 10')).toBe('0.5 worse than previous 10');
    expect(changeInWords(-0.6, 'previous 10')).toBe('0.6 better than previous 10');
    expect(changeInWords(0.04, 'previous 10')).toBe('Same as previous 10');
  });

  it('the brief makes no sentence of a player with no rounds (HOME-S5)', () => {
    const on = { name: 'Theo Marchetti', status: 'improving', quietDays: 2 } as never;
    expect(homeSubline([on], { roundsError: false, nextCompetition: null, unposted: [{ name: 'Audit Testplayer' }] })).not.toMatch(/Audit|no 18-hole/);
  });

  it('the date is the team’s day, on one helper for Home and the welcome (HOME-S10)', () => {
    const at = new Date('2026-11-07T02:30:00Z');
    expect(teamDateLabel(at, 'America/New_York')).toBe('Friday 6 November');
    expect(teamDateLabel(at, 'Asia/Tokyo')).toBe('Saturday 7 November');
    expect(src('data/home-clock.ts')).toContain('teamDateLabel(now, tz)');
    expect(src('data/welcome-shape.ts')).toContain('teamDateLabel(now, tz)');
  });

  it('Home’s rounds go through the one window helper Roster uses (HOME-S6, QA-1)', () => {
    expect(src('data/home.ts')).toContain('roundsForFigures(readRounds)');
    expect(src('data/roster.ts')).toContain('roundsForFigures(season.rounds)');
  });

  it('one shadow level: only the hero casts one (HOME-S1)', () => {
    const home = src('styles/home.css');
    expect(home).toContain('--ch-home-x2: 0 0 0 1px var(--ch-card-ring)');
    expect(home).toContain('--ch-crh-card-shadow: 0 0 0 1px var(--ch-card-ring)');
    expect(home).toMatch(/\.ch-h-herocard \{[^}]*box-shadow: var\(--ch-home-shadow-1\)/);
  });

  it('no first-paint growth on the team’s bars (CRH-20, MOT-04)', () => {
    const home = src('styles/home.css');
    const at = home.indexOf(".ch-hm[data-ch-crh='on'] .ch-hm-legs__bar > i {");
    expect(home.slice(at, home.indexOf('}', at))).not.toContain('animation');
  });
});
