import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('../../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard/coachhelm', useSearchParams: () => new URLSearchParams() }));

import { buildTeamReads } from '@/lib/coachhelm/v3/analyst/reads/build';
import { forPlayer } from '@/lib/coachhelm/v3/analyst/reads/player-card';
import { readsTeam } from '@/lib/coachhelm/v3/analyst/reads/__tests__/team';
import { hideForReadsTeam, roundHrefOf, toChAnalystRead } from '../../../../data/coachhelm-analyst-read-shape';
import type { ChDeepInsight } from '../../../../data/coachhelm-dive-shape';
import { AnalystReadCard, EvidenceRounds } from '../AnalystRead';

afterEach(cleanup);

const payload = buildTeamReads(readsTeam().rows()).payloads.find((p) => (p.priority?.evidence.length ?? 0) > 0)!;
const read = toChAnalystRead(payload);

describe('CoachHelm’s read on the coach’s file', () => {
  it('draws nothing when the flag is off or no read is saved yet', () => {
    const { container: off } = render(<AnalystReadCard load={{ status: 'off' }} first="Eli" />);
    expect(off.innerHTML).toBe('');
    const { container: none } = render(<AnalystReadCard load={{ status: 'none' }} first="Eli" />);
    expect(none.innerHTML).toBe('');
    const { container: absent } = render(<AnalystReadCard load={null} first="Eli" />);
    expect(absent.innerHTML).toBe('');
  });

  it('says it could not load, and the rest of the file stays', () => {
    render(<AnalystReadCard load={{ status: 'failed' }} first="Eli" />);
    expect(screen.getByRole('status')).toHaveTextContent('Couldn’t load Eli’s read');
  });

  it('draws the headline, how sure, how we found this, what would change it, and the rounds behind it', () => {
    render(<AnalystReadCard load={{ status: 'ready', read }} first="Eli" />);
    expect(screen.getByText(payload.priority!.headline)).toBeInTheDocument();
    expect(screen.getByText(payload.priority!.certainty_word)).toBeInTheDocument();
    expect(screen.getByText(payload.freshness.through_text)).toBeInTheDocument();
    for (const s of payload.priority!.how_we_found) expect(screen.getAllByText(s).length).toBeGreaterThan(0);
    expect(screen.getByText(payload.priority!.what_would_change)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `The ${payload.priority!.evidence.length} rounds behind it` })).toBeInTheDocument();
    if (payload.priority!.team) expect(screen.getByText(payload.priority!.team.value.text)).toBeInTheDocument();
  });

  it('each evidence round opens its round, worst first, with its shots', () => {
    render(<EvidenceRounds read={read} />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.getAttribute('href'))).toEqual(payload.priority!.evidence.map((e) => roundHrefOf(e.round_id)));
    expect(screen.getByText(payload.priority!.evidence[0]!.carry[0]!.text)).toBeInTheDocument();
  });

  it('draws the Stage 3 paragraph only when the writer has added one', () => {
    expect(read.written).toBeNull();
    const written = toChAnalystRead({ ...payload, written: { what: 'What is going on.', rules_in_out: 'Rules out the putter.', this_week: 'Ten wedges a day.', watch: 'Log the miss side.', model: 'm', checked_at: '2026-11-17' } });
    render(<AnalystReadCard load={{ status: 'ready', read: written }} first="Eli" />);
    expect(screen.getByText('Ten wedges a day.')).toBeInTheDocument();
  });

  it('a player’s card carries no team sentence', () => {
    expect(toChAnalystRead(forPlayer(payload)).team).toBeNull();
  });
});

describe('a team on reads hides today’s notes, good news and root cause', () => {
  const d = (id: string, kind: 'finding' | 'strength' | 'note'): ChDeepInsight => ({ base: { id, kind }, diagnosis: { cause: 'one sentence' } }) as unknown as ChDeepInsight;
  it('keeps the findings, drops the rest, and strips the cause', () => {
    const out = hideForReadsTeam([d('a', 'finding'), d('b', 'strength'), d('c', 'note')]);
    expect(out.map((x) => x.base.id)).toEqual(['a']);
    expect(out[0]!.diagnosis).toBeNull();
  });
});
