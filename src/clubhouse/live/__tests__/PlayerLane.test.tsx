// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/golf/dashboard' }));
vi.mock('../../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));

import { HoleBeads, RING_MS } from '../HoleBeads';
import { PlayerLane, peekActions } from '../PlayerLane';
import { PREVIEW_LIVE, PREVIEW_LIVE_NOW, PREVIEW_LIVE_STARTS } from '../../preview/fixtures-live';
import type { LiveLane } from '../model';

afterEach(cleanup);

const byName = (name: string): LiveLane => [...PREVIEW_LIVE.lanes, ...PREVIEW_LIVE_STARTS.lanes].find((l) => l.name === name)!;

const draw = (lane: LiveLane, over: Partial<Parameters<typeof PlayerLane>[0]> = {}) =>
  render(
    <ul>
      <PlayerLane lane={lane} density="compact" now={PREVIEW_LIVE_NOW} hours="12" reduced={false} {...over} />
    </ul>,
  );

describe('PlayerLane', () => {
  it('reads each lane as one sentence and hides the beads from VoiceOver', () => {
    const { container } = draw(byName('Sofia Reyes'), { onOpen: vi.fn() });
    const hit = screen.getByRole('button');
    expect(hit.getAttribute('aria-label')).toBe('Sofia Reyes, 2 under par through 11, playing hole 12, par 3. Qualifier, round 2.');
    expect(container.querySelector('.ch-lv-beads')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('shows the figures: to-par with a true minus, thru, and where they are', () => {
    draw(byName('Sofia Reyes'), { onOpen: vi.fn() });
    expect(screen.getByText('−2')).toBeTruthy();
    expect(screen.getByText('thru 11')).toBeTruthy();
    expect(screen.getByText(/Qualifier · R2 · 12 · Par 3/)).toBeTruthy();
  });

  it('says a stale lane is stale in words, and a quiet one when it last spoke, and keeps both at full strength', () => {
    const { container, rerender } = draw(byName('Ellis Grant'), { onOpen: vi.fn() });
    expect(container.querySelector('[data-ch-code="CH-16672"]')!.textContent).toBe('Last update 14 min ago');
    expect(container.querySelector('li')!.getAttribute('data-freshness')).toBe('stale');
    rerender(
      <ul>
        <PlayerLane lane={byName('Noor Haddad')} density="compact" now={PREVIEW_LIVE_NOW} hours="12" reduced={false} onOpen={vi.fn()} />
      </ul>,
    );
    expect(container.querySelector('[data-ch-code="CH-16673"]')!.textContent).toMatch(/^No update since \d{1,2}:\d{2} (AM|PM)$/);
    expect(container.querySelector('li')!.getAttribute('data-freshness')).toBe('quiet');
  });

  it('writes the final form of a posted lane: F, the total, and a stopped lane says Stopped', () => {
    const { container } = draw(PREVIEW_LIVE.lanes.find((l) => l.phase === 'posted')!, { onOpen: vi.fn() });
    expect(container.querySelector('.ch-lv-thru')!.textContent).toBe('72');
    cleanup();
    const stopped = draw({ ...byName('Sofia Reyes'), phase: 'stopped', thru: 9, endedAt: new Date(PREVIEW_LIVE_NOW - 60_000).toISOString() }, { onOpen: vi.fn() });
    expect(stopped.container.querySelector('.ch-lv-thru')!.textContent).toBe('Stopped');
    expect(stopped.container.querySelector('[data-ch-code="CH-16674"]')!.textContent).toBe('Stopped thru 9');
  });

  it('opens the player on a tap', async () => {
    const onOpen = vi.fn();
    draw(byName('Sofia Reyes'), { onOpen });
    await userEvent.click(screen.getByRole('button'));
    expect(onOpen).toHaveBeenCalledWith(byName('Sofia Reyes'));
  });

  it('without an open handler a lane is information, not a button', () => {
    draw(byName('Sofia Reyes'));
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('group').getAttribute('aria-label')).toContain('Sofia Reyes');
  });

  it('puts the to-par wash on the cell for a new score, and none under reduced motion', () => {
    const { container, rerender } = draw(byName('Sofia Reyes'), { change: { n: 1, holes: [11], wash: 'under', late: false } });
    expect(container.querySelector('.ch-lv-par')!.getAttribute('data-wash')).toBe('under');
    rerender(
      <ul>
        <PlayerLane lane={byName('Sofia Reyes')} density="compact" now={PREVIEW_LIVE_NOW} hours="12" reduced change={{ n: 1, holes: [11], wash: 'under', late: false }} />
      </ul>,
    );
    expect(container.querySelector('.ch-lv-par')!.getAttribute('data-wash')).toBeNull();
    expect(container.querySelector('.ch-lv-par')!.getAttribute('data-ring')).toBe('');
  });
});

describe('a lane’s peek actions', () => {
  const label = (lane: LiveLane) => peekActions(lane).map((a) => [a.label, a.href]);

  it('open a posted round’s review', () => {
    const posted = byName('Ada Lin');
    expect(posted.phase).toBe('posted');
    expect(label(posted)).toContainEqual(['Open round', `/golf/dashboard/rounds/${posted.roundId}`]);
  });

  it('follow a round still being played on Live, narrowed to the player, never its review (a coach would be bounced Home)', () => {
    const live = [...PREVIEW_LIVE.lanes, ...PREVIEW_LIVE_STARTS.lanes].filter((l) => l.phase !== 'posted');
    expect(live.length).toBeGreaterThan(0);
    for (const lane of live) {
      expect(label(lane).map(([l]) => l)).not.toContain('Open round');
      expect(label(lane)).toContainEqual(['Follow on Live', `/golf/dashboard/live?player=${lane.playerId}`]);
    }
  });
});

describe('the lane stylesheet', () => {
  const css = readFileSync(join(__dirname, '../../styles/live.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('has no border, stripe or inset on the left of anything (the lane divider is a top hairline)', () => {
    expect(css).not.toMatch(/border-(left|inline-start)/);
    expect(css).not.toMatch(/box-shadow:\s*inset\s+-?\d+px\s+0/);
  });
  it('keeps a hit target of at least 44px on every control and 48px on a compact lane', () => {
    expect(css).toMatch(/\.ch-lv-hit \{[^}]*min-height: 48px/);
    for (const sel of ['.ch-lv-card__open', '.ch-lv-sort', '.ch-lv-pill', '.ch-lv-eventrow']) {
      const rule = new RegExp(`${sel.replace('.', '\\.')}[^{]*\\{[^}]*min-height: 44px`);
      expect(css, sel).toMatch(rule);
    }
  });
  it('does not dim a quiet lane: no opacity on a lane or its parts (Must 3), and no breathing dot (D-33)', () => {
    expect(css).not.toMatch(/\.ch-lv-lane[^{]*\{[^}]*opacity/);
    expect(css).not.toMatch(/ch-live-breathe|animation:[^;]*infinite/);
  });
  it('never transitions a layout property', () => {
    for (const m of css.matchAll(/transition(?:-property)?:\s*([^;]+);/g)) expect(m[1]).not.toMatch(/\b(width|height|top|left|right|bottom|margin|padding|grid|flex|inset)\b/);
  });
});

describe('HoleBeads', () => {
  const kinds = (c: HTMLElement) => [...c.querySelectorAll('.ch-lv-bead')].map((b) => b.getAttribute('data-kind'));
  it('draws one mark per planned hole in play order, with the gap after the ninth', () => {
    const { container } = render(<HoleBeads lane={byName('Eli Brooks')} density="full" reduced={false} />);
    const marks = [...container.querySelectorAll('.ch-lv-bead')];
    expect(marks.map((b) => b.getAttribute('data-hole'))).toEqual(['10', '11', '12', '13', '14', '15', '16', '17', '18', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
    expect(marks[9]!.className).toContain('has-gap');
    expect(marks.filter((b) => b.className.includes('has-gap'))).toHaveLength(1);
  });
  it('a nine-hole round has nine marks and no gap', () => {
    const { container } = render(<HoleBeads lane={byName('Sam Whitfield')} density="full" reduced={false} />);
    expect(container.querySelectorAll('.ch-lv-bead')).toHaveLength(9);
    expect(container.querySelector('.has-gap')).toBeNull();
  });
  it('shows the shapes by result and a ring on the hole being played', () => {
    const { container } = render(<HoleBeads lane={byName('Mateo Lind')} density="full" reduced={false} />);
    expect(kinds(container).slice(0, 14)).toEqual(['par', 'par', 'par', 'par', 'bogey', 'par', 'par', 'par', 'bogey', 'par', 'par', 'par', 'double', 'unplayed']);
    expect(container.querySelector('[data-current]')!.getAttribute('data-hole')).toBe('14');
  });
  it('compact shows only the last six played holes, newest on the right', () => {
    const { container } = render(<HoleBeads lane={byName('Sofia Reyes')} density="compact" reduced={false} />);
    expect([...container.querySelectorAll('.ch-lv-bead')].map((b) => b.getAttribute('data-hole'))).toEqual(['6', '7', '8', '9', '10', '11']);
  });
  it('a hole that just gained a score scales in; under reduced motion it takes a ring for three seconds, then none', () => {
    vi.useFakeTimers();
    try {
      const lane = byName('Sofia Reyes');
      const a = render(<HoleBeads lane={lane} density="compact" reduced={false} change={{ n: 1, holes: [11], wash: 'under', late: false }} />);
      expect(a.container.querySelectorAll('[data-fresh]')).toHaveLength(1);
      a.unmount();
      const b = render(<HoleBeads lane={lane} density="compact" reduced change={{ n: 2, holes: [11], wash: null, late: false }} />);
      expect(b.container.querySelectorAll('[data-fresh]')).toHaveLength(0);
      expect(b.container.querySelectorAll('[data-ring]')).toHaveLength(1);
      act(() => void vi.advanceTimersByTime(RING_MS + 10));
      expect(b.container.querySelectorAll('[data-ring]')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
