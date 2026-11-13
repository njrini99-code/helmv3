import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));

import { tourFixture } from '../../../preview/fixtures-tournaments';
import { EventDesk } from '../EventDesk';
import { History } from '../History';
import { finishOf } from '../format';
import type { ChTourDeskSearch, ChTourEntry } from '../types';
import '../../../__tests__/dialog-polyfill';

afterEach(cleanup);

/** Coach audit 13 Nov 2026 (§11 #5, #7, #8): small things on the event pages that said something untrue. */
describe('the event pages say what is true', () => {
  const ready = tourFixture('ready');
  const search: ChTourDeskSearch = { tab: 'overview', round: 'all', view: 'team', holes: 'to-par' };

  it('a finish among fewer teams than the field says both ("4 of 4" against a field of 12)', () => {
    expect(finishOf({ of: 4, field: 12 })).toBe('of 4 scored · 12 teams');
    expect(finishOf({ of: 12, field: 12 })).toBe('of 12');
    expect(finishOf({ of: 6, field: null })).toBe('of 6');
    expect(finishOf({ of: 6 })).toBe('of 6');
  });

  it('History’s eyebrow is the team, not "Varsity"', () => {
    render(<History data={{ ...ready.history, teamName: 'Guilford Men' }} search={{ mode: 'actual', adjust: 'raw' }} load="ready" phone={false} />);
    expect(document.body.textContent).toContain('Guilford Men ·');
    expect(document.body.textContent).not.toContain('Varsity ·');
  });

  it('the desk’s eyebrow has no dangling separator when the tees are not set', () => {
    const desk = ready.desks.e33!;
    const course = desk.courses[desk.event.courseIds[0]!]!;
    const { container } = render(<EventDesk data={{ ...desk, courses: { ...desk.courses, [course.id]: { ...course, tees: '' } } }} search={search} load="ready" phone={false} />);
    const eyebrow = container.querySelector('.ch-tour-head__k')!.textContent!.trim();
    expect(eyebrow).toContain(course.name);
    expect(eyebrow.endsWith('·')).toBe(false);
  });

  it('alternates with no score fold into one line, not a row of No data each', () => {
    const base = ready.desks.e33!;
    const extra = { id: 'charley', name: 'Charley Ames', first: 'Charley', initials: 'CA', year: '', avatarUrl: null, alumni: false, availability: 'available' as const };
    const desk = { ...base, players: [...base.players, extra] };
    const entered = new Set([...desk.event.entries.map((e) => e.playerId), ...desk.event.playerRounds.map((p) => p.playerId)]);
    const alts: ChTourEntry[] = desk.players
      .filter((p) => !entered.has(p.id))
      .slice(0, 2)
      .map((p) => ({ playerId: p.id, role: 'alternate', slot: null, squad: 'A' }));
    expect(alts).toHaveLength(2);
    const names = alts.map((a) => desk.players.find((p) => p.id === a.playerId)!.first);
    render(<EventDesk data={{ ...desk, event: { ...desk.event, entries: [...desk.event.entries, ...alts] } }} search={{ ...search, tab: 'counted' }} load="ready" phone={false} />);
    expect(screen.getByText(`Alternates: ${names.join(', ')}`)).toBeTruthy();
    const rows = [...document.querySelectorAll('.ch-tour-desk-ct__row')].filter((r) => names.some((n) => r.textContent?.includes(n)));
    expect(rows).toHaveLength(0);
  });
});
