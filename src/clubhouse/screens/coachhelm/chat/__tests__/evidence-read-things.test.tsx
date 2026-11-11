import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STUDIO_READ_BOARD, STUDIO_READ_ROUND, STUDIO_READ_SCHEDULE } from '../../../../preview/fixtures-chat-studio';
import { AskEvidenceView } from '../Evidence';

/**
 * A read whose detail is a thing the app has a screen for is drawn as that thing in the answer (studio/from.ts
 * `fromRead`): the calendar's days, a qualifier's board, a round's scorecard. It stands in for the table of the same
 * rows; it is never drawn beside one.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

afterEach(cleanup);

describe('a read that is a thing, in an answer', () => {
  it('draws the schedule read as the calendar’s days, each event a key and a way in', () => {
    const { container } = render(<AskEvidenceView envelope={STUDIO_READ_SCHEDULE} />);
    const fig = container.querySelector('figure.ch-aks-ev__fig[data-kind="schedule"]');
    expect(fig).not.toBeNull();
    expect(fig!.querySelectorAll('.ch-aks-sched__event')).toHaveLength(4);
    expect(fig!.textContent).toContain('6 going, 1 maybe, 1 out, 1 not replied');
    expect(fig!.textContent).toContain('2 players have a class then');
    expect(fig!.querySelector('a[href*="ev-1"]')).not.toBeNull();
    expect(container.querySelector('table')).toBeNull();
  });

  it('draws the qualifier read as its board, with the cut, and not as a ranking or a table of the same players', () => {
    const { container } = render(<AskEvidenceView envelope={STUDIO_READ_BOARD} />);
    const fig = container.querySelector('figure.ch-aks-ev__fig[data-kind="qualifier_board"]');
    expect(fig).not.toBeNull();
    expect(fig!.textContent).toContain('The cut · 4 seats');
    expect(container.querySelectorAll('.ch-aks-ev > *')).toHaveLength(1);
    expect(container.querySelector('.ch-aks-rank, .ch-aks-table')).toBeNull();
  });

  it('draws the round read as its scorecard', () => {
    const { container } = render(<AskEvidenceView envelope={STUDIO_READ_ROUND} />);
    const fig = container.querySelector('figure.ch-aks-ev__fig[data-kind="round"]');
    expect(fig).not.toBeNull();
    expect(fig!.querySelectorAll('.ch-nine')).toHaveLength(2);
    expect(fig!.textContent).toContain('75, 3 over');
  });

  it('keeps a partial read’s caveat under the drawing when no block is left to carry it', () => {
    const { container } = render(<AskEvidenceView envelope={{ ...STUDIO_READ_SCHEDULE, coverage: 'partial', coverage_note: 'Two events have no replies yet.' }} />);
    expect(container.querySelectorAll('.ch-aks-ev > *')).toHaveLength(1);
    expect(container.querySelector('.ch-aks-ev__fig .ch-aks-ev__note')?.textContent).toBe('Two events have no replies yet.');
    // Said once: a complete read says nothing under its drawing.
    cleanup();
    expect(render(<AskEvidenceView envelope={STUDIO_READ_SCHEDULE} />).container.querySelector('.ch-aks-ev__note')).toBeNull();
  });

  it('with tapping off (the evidence sheet), nothing in the drawing asks', () => {
    const { container } = render(<AskEvidenceView envelope={STUDIO_READ_SCHEDULE} ask={false} />);
    expect(container.querySelector('.ch-aks-sched')).not.toBeNull();
    expect(container.querySelector('button.ch-aks-ask')).toBeNull();
  });
});
