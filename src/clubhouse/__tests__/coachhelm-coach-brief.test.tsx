import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

vi.mock('server-only', () => ({}));
vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('../lib/track-server', () => ({ chLogServer: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm' }));
vi.mock('../lib/use-phone', () => ({ useChPhone: () => false, CH_PHONE_QUERY: '(max-width: 820px)' }));

// The loader's reads, each replaceable per test.
const reads = vi.hoisted(() => ({
  gate: vi.fn(),
  inputs: vi.fn(),
  goals: vi.fn(),
  standing: vi.fn(),
  record: vi.fn(),
  recordOn: { value: false },
  focus: { data: [] as unknown[] | null, error: null as unknown },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: () => {
      const q = { select: () => q, in: () => q, order: async () => ({ data: reads.focus.data, error: reads.focus.error }) };
      return q;
    },
  }),
}));
vi.mock('../data/coachhelm-monday-brief', () => ({ briefGate: reads.gate }));
vi.mock('@/lib/coachhelm/v3/monday-brief/loader', () => ({ loadBriefInputs: reads.inputs }));
vi.mock('@/lib/coachhelm/v3/goals/loader', () => ({ loadActiveGoalsForPlayers: reads.goals }));
vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({ loadPlayersStandingMap: reads.standing }));
vi.mock('@/lib/coachhelm/v3/track-record/flag', () => ({ isTrackRecordEnabled: () => reads.recordOn.value }));
vi.mock('../data/coachhelm-track-record', () => ({ loadCoachTrackRecord: reads.record }));

import { briefHref, intelligenceTarget, toChCoachBrief } from '../data/coachhelm-coach-brief-shape';
import { loadCoachBrief } from '../data/coachhelm-coach-brief';
import { PREVIEW_COACH_BRIEF, PREVIEW_COACH_BRIEF_NO_READS, PREVIEW_COACH_BRIEF_PARTIAL, PREVIEW_COACH_BRIEF_THIN } from '../preview/fixtures-coachhelm-coach-brief';
import { PREVIEW_TRACK_RECORD } from '../preview/fixtures-coachhelm-track';
import { CoachBrief } from '../screens/coachhelm/views/CoachBrief';

const code = (c: string) => document.querySelector(`[data-ch-code="${c}"]`);

afterEach(cleanup);

describe('the coach Brief behind /intelligence (par-05): what it says', () => {
  it('CH-13984 this week lists every player’s top read at Likely or above, most strokes first, and leaves the pattern to its own section', () => {
    const d = PREVIEW_COACH_BRIEF;
    expect(d.reads.map((r) => [r.who, r.title, r.tag])).toEqual([
      ['Priya Shah', 'Three-putts', 'Seen repeatedly'],
      ['Maya Chen', 'Tee shots with driver: penalties', 'Observed'],
      ['Theo Marchetti', 'Bogey after a missed green', 'Likely'],
      ['Lena Duarte', 'Up and down from short-sided misses', 'Observed'],
      ['Jonah Okafor', 'Downhill putts, 4–6 ft', 'Likely'],
      ['Ava Lindqvist', 'Second putts from 3–5 ft', 'Likely'],
    ]);
    // Six reads: more than the Monday brief's five, because the Brief is the team view.
    expect(d.reads.every((r) => r.kind === 'read')).toBe(true);
    expect(d.patterns?.rows.map((r) => r.title)).toEqual(['Wedges 50–125 yd · finishing short']);
    expect(d.cleared).toEqual(['Noah Brandt · 4–6 ft putts']);
  });

  it('CH-13985 working on: each live focus area with its progress in the stat’s unit and the rounds since it started', () => {
    expect(PREVIEW_COACH_BRIEF.working.map((w) => [w.who, w.title, w.word, w.line, w.since])).toEqual([
      ['Jonah Okafor', 'Downhill putts, 4–6 ft', 'Active', null, '1 round since Oct 15'],
      ['Maya Chen', 'Wedges inside 20 ft', 'In progress', 'Now 23 ft, target 18 ft, from 27 ft', '3 rounds since Oct 5'],
      ['Priya Shah', 'Lag putting inside 3 ft', 'Active', 'Now 78%, target 85%, from 71%', '5 of 8 rounds since Oct 1'],
      // A focus with no measured stat keeps its words and prints no number.
      ['Theo Marchetti', 'Pre-shot routine under pressure', 'Active', null, '2 rounds since Sep 28'],
    ]);
  });

  it('CH-13987 goals and standing: the goal’s progress, then the team (five or more teammates) and the Tour on the same stat', () => {
    const goals = PREVIEW_COACH_BRIEF.goals;
    expect(goals.map((p) => p.name)).toEqual(['Maya Chen', 'Priya Shah', 'Sam Whitaker']);
    expect(goals[0]!.goals.map((g) => [g.title, g.line, g.standing])).toEqual([
      ['Hit 10 greens a round', 'Now 51%, target 56%, by Nov 30', 'Team 54% · Tour 67%'],
      ['Break even on the greens', 'Now −0.4, target 0.0, by Nov 30', null],
    ]);
    expect(goals[2]!.goals[0]!.standing).toBe('Tour 58%');
    expect(PREVIEW_COACH_BRIEF.goalsNone).toBe('6 players have no active goal.');
  });

  it('CH-13986 the track record is its program line and a link, only with its flag on and something shown', () => {
    expect(PREVIEW_COACH_BRIEF.record?.href).toBe('/golf/dashboard/coachhelm?view=track-record');
    expect(PREVIEW_COACH_BRIEF.record?.program).toMatch(/^Since .* CoachHelm showed \d+ reads on this team\./);
    expect(PREVIEW_COACH_BRIEF_THIN.record).toBeNull();
  });

  it('a section with nothing in it is left out; a section whose read failed is named, never drawn empty', () => {
    expect(PREVIEW_COACH_BRIEF_THIN.patterns).toBeNull();
    expect(PREVIEW_COACH_BRIEF_THIN.working).toHaveLength(1);
    expect(PREVIEW_COACH_BRIEF.missing).toBeNull();
    expect(PREVIEW_COACH_BRIEF_PARTIAL.goals).toEqual([]);
    expect(PREVIEW_COACH_BRIEF_PARTIAL.missing).toBe('Goals did not load. The rest of the brief is current; try again in a moment.');
    const failed = toChCoachBrief({
      brief: { team_id: 't', week_start: '2026-10-12', week_end: '2026-10-19', roster_total: 1, with_enough_rounds: 0, rounds_last_week: 0, items: [], counts: { new: 0, cleared: 0, contradicted: 0, out_of_date: 0 }, cleared: [], computed_at: '' },
      patterns: null,
      roster: [{ id: 'p', name: 'P' }],
      rounds: [],
      focus: null,
      goals: new Map(),
      standing: null,
      record: 'failed',
    });
    expect(failed.missing).toBe('What players are working on and the track record did not load. The rest of the brief is current; try again in a moment.');
  });

  it('CH-13998 an old /intelligence address lands on its part of the Brief with the flag on, and on the board with it off', () => {
    const q = (s: string) => new URLSearchParams(s);
    expect(intelligenceTarget(q('view=signals&filter=patterns'), true, null)).toBe(briefHref('patterns'));
    expect(intelligenceTarget(q('view=players'), true, null)).toBe('/golf/dashboard/coachhelm?view=brief&section=working');
    expect(intelligenceTarget(q('view=effectiveness'), true, null)).toBe('/golf/dashboard/coachhelm?view=brief&section=record');
    expect(intelligenceTarget(q('view=home'), true, null)).toBe('/golf/dashboard/coachhelm?view=brief');
    expect(intelligenceTarget(q('view=players&player=p1'), true, 'p1')).toBe('/golf/dashboard/coachhelm?player=p1');
    expect(intelligenceTarget(q('view=chat&player=p1'), true, 'p1')).toBe('/golf/dashboard/coachhelm?player=p1&view=ask');
    expect(intelligenceTarget(q('view=effectiveness'), false, null)).toBe('/golf/dashboard/coachhelm');
  });
});

describe('the coach Brief on screen', () => {
  it('CH-13983 draws the five sections in order, each read with one Open action, and no confidence percent on a read', () => {
    render(<CoachBrief load={{ status: 'ready', data: PREVIEW_COACH_BRIEF }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Brief' })).toBeTruthy();
    const ids = [...document.querySelectorAll('.ch-hbr-sec')].map((s) => s.id);
    expect(ids).toEqual(['ch-hbr-week', 'ch-hbr-patterns', 'ch-hbr-working', 'ch-hbr-record', 'ch-hbr-goals']);
    const week = code('CH-13984') as HTMLElement;
    expect(within(week).getAllByRole('link', { name: 'Open' })).toHaveLength(6);
    expect(week.textContent).not.toMatch(/\d%/);
    expect(within(code('CH-13986') as HTMLElement).getByRole('link', { name: 'Track record' }).getAttribute('href')).toBe('/golf/dashboard/coachhelm?view=track-record');
    expect(code('CH-13989')).toBeNull();
  });

  it('CH-13988 no reads: says so in the week, and the team sections still draw', () => {
    render(<CoachBrief load={{ status: 'ready', data: PREVIEW_COACH_BRIEF_NO_READS }} />);
    expect(code('CH-13988')).not.toBeNull();
    expect(screen.getByText('No open reads this week')).toBeTruthy();
    expect(code('CH-13985')).not.toBeNull();
    expect(code('CH-13987')).not.toBeNull();
    expect(document.getElementById('ch-hbr-patterns')).toBeNull();
  });

  it('CH-13989 a section that did not load is named above the rest', () => {
    render(<CoachBrief load={{ status: 'ready', data: PREVIEW_COACH_BRIEF_PARTIAL }} />);
    expect(within(code('CH-13989') as HTMLElement).getByText(/Goals did not load/)).toBeTruthy();
    expect(code('CH-13987')).toBeNull();
  });

  it('opens on the section an old link named', () => {
    const into = vi.fn();
    Element.prototype.scrollIntoView = into;
    render(<CoachBrief load={{ status: 'ready', data: PREVIEW_COACH_BRIEF }} section="record" />);
    expect(into).toHaveBeenCalledTimes(1);
    expect(into.mock.contexts[0]).toBe(document.getElementById('ch-hbr-record'));
  });

  it('CH-13999 CH-13997 off and failed are their own pages, never an empty brief', () => {
    const { unmount } = render(<CoachBrief load={{ status: 'failed' }} />);
    expect(code('CH-13997')).not.toBeNull();
    expect(screen.getByText('The brief didn’t load')).toBeTruthy();
    unmount();
    render(<CoachBrief load={{ status: 'off', reason: 'Paused for exams' }} />);
    expect(code('CH-13999')).not.toBeNull();
    expect(screen.getByText(/Paused for exams/)).toBeTruthy();
  });
});

describe('loadCoachBrief', () => {
  const ROSTER = [
    { id: 'p1', name: 'Pat One' },
    { id: 'p2', name: 'Sam Two' },
  ];
  beforeEach(() => {
    vi.clearAllMocks();
    reads.gate.mockResolvedValue(null);
    reads.inputs.mockResolvedValue({ roster: ROSTER, reads: [], rounds: [], eligible: new Set(), patterns: null });
    reads.goals.mockResolvedValue(new Map());
    reads.standing.mockResolvedValue(new Map());
    reads.record.mockResolvedValue({ status: 'ready', data: PREVIEW_TRACK_RECORD });
    reads.recordOn.value = false;
    reads.focus = { data: [], error: null };
  });

  it('reads nothing past the gate when CoachHelm is off or the gate failed', async () => {
    reads.gate.mockResolvedValue({ status: 'off', reason: null });
    expect(await loadCoachBrief({ coachId: 'c', teamId: 't' })).toEqual({ status: 'off', reason: null });
    expect(reads.inputs).not.toHaveBeenCalled();
    reads.gate.mockResolvedValue({ status: 'failed' });
    expect(await loadCoachBrief({ coachId: 'c', teamId: 't' })).toEqual({ status: 'failed' });
  });

  it('is failed when the roster, reads or rounds the brief is made from failed', async () => {
    reads.inputs.mockResolvedValue(null);
    expect(await loadCoachBrief({ coachId: 'c', teamId: 't' })).toEqual({ status: 'failed' });
  });

  it('a section read that failed leaves the brief ready and names it; the track record is read only with its flag on', async () => {
    reads.focus = { data: null, error: { message: 'boom' } };
    reads.goals.mockRejectedValue(new Error('goals down'));
    const out = await loadCoachBrief({ coachId: 'c', teamId: 't' });
    expect(out.status).toBe('ready');
    if (out.status !== 'ready') return;
    expect(out.data.missing).toBe('What players are working on and goals did not load. The rest of the brief is current; try again in a moment.');
    expect(out.data.record).toBeNull();
    expect(reads.record).not.toHaveBeenCalled();

    reads.recordOn.value = true;
    reads.focus = { data: [], error: null };
    reads.goals.mockResolvedValue(new Map());
    const on = await loadCoachBrief({ coachId: 'c', teamId: 't' });
    expect(reads.record).toHaveBeenCalledTimes(1);
    expect(on.status === 'ready' && on.data.record?.href).toBe('/golf/dashboard/coachhelm?view=track-record');
  });
});
