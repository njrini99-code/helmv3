import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChClass, ChTerm, ChWeek } from '../../../data/classes-shape';
import { meetingsOn, soonItems, TermCard, TodayCard } from '../ClassesCrh';

vi.mock('../../../lib/use-clock', () => ({ useChClock: () => '12' }));
afterEach(cleanup);

const TERM: ChTerm = { label: 'Fall 2026', start: '2026-08-20', end: '2026-12-15', week: 11, weeks: 17, startsIn: null, progress: 0.612 };
const WEEK: ChWeek = { dates: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'], events: [], error: false };
const cls = (id: string, over: Partial<ChClass> = {}): ChClass =>
  ({ id, code: 'BIOL 1010', name: 'Biology', days: ['M', 'W'], start: '09:05', end: '09:55', location: 'Science Hall', instructor: null, credits: 3, semester: 'Fall 2026', tone: 'mist', ...over }) as ChClass;

describe('meetingsOn', () => {
  it('renders two rows with the same code and start once, and sorts by start', () => {
    const list = meetingsOn([cls('a'), cls('b'), cls('c', { code: 'HIST 200', start: '08:00' })], TERM, '2026-11-02');
    expect(list.map((c) => c.id)).toEqual(['c', 'a']);
  });
});

describe('soonItems', () => {
  it('holds this week’s events and the term end, nothing else', () => {
    const week = { ...WEEK, events: [{ id: 'e', title: 'Fall Invitational', type: 'travel', startDate: '2026-11-06', startMin: 510, endDate: '2026-11-06', endMin: 1000, allDay: false, where: null }] };
    expect(soonItems(TERM, week, '2026-11-03').map((s) => s.what)).toEqual(['Fall Invitational', 'Term ends']);
    expect(soonItems(TERM, { ...WEEK, error: true }, '2026-11-03').map((s) => s.what)).toEqual(['Term ends']);
  });
});

describe('TermCard', () => {
  it('reads the week, weeks left and term end, with no finals', () => {
    const { container } = render(<TermCard term={TERM} classes={[cls('a')]} week={WEEK} todayIso="2026-11-03" overlaps={1} overlapsError={false} onOverlaps={() => {}} />);
    expect(screen.getByText('Week 11')).toBeTruthy();
    expect(screen.getByText('6 weeks left · term ends Dec 15')).toBeTruthy();
    expect(screen.getByText('1 overlap')).toBeTruthy();
    expect(container.textContent).not.toMatch(/finals|holiday/i);
  });
  it('hides the chip with no overlaps', () => {
    render(<TermCard term={TERM} classes={[cls('a')]} week={WEEK} todayIso="2026-11-03" overlaps={0} overlapsError={false} onOverlaps={() => {}} />);
    expect(screen.queryByText(/overlap/)).toBeNull();
  });
});

describe('TodayCard', () => {
  it('names the next class day when today has none, with its ribbon', () => {
    const { container } = render(<TodayCard classes={[cls('a', { days: ['M'] })]} term={TERM} todayIso="2026-11-07" week={WEEK} onOpen={() => {}} />);
    expect(screen.getByText('No classes today')).toBeTruthy();
    expect(screen.getByText('Next: Monday, Nov 9')).toBeTruthy();
    expect(container.querySelector('.ch-cl-ribbon')).not.toBeNull();
  });
  it('a class day draws the day strip too (how many, when the first starts, where they fall from 7 to 5), then the rows, the time one node', () => {
    const { container } = render(<TodayCard classes={[cls('a')]} term={TERM} todayIso="2026-11-02" week={WEEK} onOpen={() => {}} />);
    const strip = container.querySelector('.ch-cl-today2')!;
    expect(strip.querySelector('.ch-cl-today2__h b')?.textContent).toBe('1 class today');
    expect(strip.querySelector('.ch-cl-today2__h span')?.textContent).toMatch(/^First at /);
    // Today's own day on the ribbon, one block for the one class; it is not the "no classes" state.
    expect(strip.querySelectorAll('.ch-cl-ribbon > i')).toHaveLength(1);
    expect(strip.getAttribute('data-ch-code')).toBeNull();
    expect(container.textContent).not.toMatch(/No classes today/);
    expect(container.querySelectorAll('.ch-cl-tr__t b.ch-num')).toHaveLength(1);
  });
});
