import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_TRACK_RECORD } from '../../../../preview/fixtures-coachhelm-track';
import { RecordCard } from '../Cards';
import { StoriesCard } from '../Stories';

vi.mock('../../../../lib/use-phone', () => ({ useChPhone: () => true }));
afterEach(cleanup);

const ready = PREVIEW_TRACK_RECORD as Extract<typeof PREVIEW_TRACK_RECORD, { state: 'ready' }>;

describe('the track record headline', () => {
  it('counts every rechecked read, not only the levels with enough to draw a bar', () => {
    render(<RecordCard part={{ status: 'ok', value: ready }} />);
    expect(screen.getByText(`${ready.held} of ${ready.rechecked}`)).toBeTruthy();
    const drawn = ready.rungs.reduce((n, g) => n + (g.bar?.of ?? 0), 0);
    expect(ready.rechecked).toBeGreaterThan(drawn);
  });
});

describe('Re-check stays on every record card', () => {
  const recheck = <button type="button">Re-check reads</button>;
  it.each([
    ['failed', { status: 'failed' }],
    ['unavailable', { status: 'ok', value: { state: 'unavailable' } }],
    ['empty', { status: 'ok', value: { ...ready, empty: true } }],
  ])('%s', (_name, part) => {
    render(<RecordCard part={part as never} recheck={recheck} />);
    expect(screen.getByRole('button', { name: 'Re-check reads' })).toBeTruthy();
  });
});

describe('asking for a story', () => {
  const brief = {
    week: 'Week of Oct 26',
    counts: null,
    reads: [{ id: 'r1', kind: 'read', who: 'Eli Brandt', title: 'Two doubles', href: '/x', behind: null, next: null }],
    working: [],
  } as never;
  const card = (request: { id: string } | null) => (
    <StoriesCard brief={brief} themes={null} failed={false} players={[]} phone rounds={null} request={request} onDesk={() => {}} onAction={() => {}} />
  );

  it('opens it each time, even the same story again after closing it', () => {
    vi.useFakeTimers();
    const { rerender } = render(card(null));
    expect(document.querySelector('.story')).toBeNull();
    rerender(card({ id: 'read:r1' }));
    expect(document.querySelector('.story')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close stories' }));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(document.querySelector('.story')).toBeNull();
    rerender(card({ id: 'read:r1' }));
    expect(document.querySelector('.story')).toBeTruthy();
    vi.useRealTimers();
  });
});
