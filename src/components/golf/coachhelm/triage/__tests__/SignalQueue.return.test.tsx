import { describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { SignalQueue } from '../SignalQueue';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';

function signal(id: string): GroupedSignal {
  return {
    id,
    kind: 'insight',
    category: 'putting',
    severity: 'high',
    title: `Signal ${id}`,
    claim: `Claim ${id}`,
    ageDays: 1,
    status: 'active',
    strokeImpact: 0.5,
    playerId: 'p-1',
    supersededCount: 0,
  } as GroupedSignal;
}

const groups: SignalGroup[] = [
  { playerId: 'p-1', playerName: 'Cole Bennett', attentionScore: 1, worstSeverity: 'high', signals: [signal('a'), signal('b')] },
];

function renderQueue(returnSignalId: string | null) {
  return render(
    <SignalQueue
      groups={groups}
      allGroups={groups}
      categories={[]}
      filter={'all' as never}
      filterHref={() => '#'}
      onSelectFilter={() => {}}
      selectedSignalId={null}
      onSelectSignal={() => {}}
      signalHref={(id) => `?signal=${id}`}
      returnSignalId={returnSignalId}
    />,
  );
}

describe('SignalQueue: return to the row the coach closed (MOT-19)', () => {
  it('scrolls the returned row into view and highlights it briefly', () => {
    vi.useFakeTimers();
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    const { container } = renderQueue('b');
    const row = container.querySelector<HTMLElement>('[data-signal-id="b"]')!;
    expect(scroll).toHaveBeenCalledWith({ block: 'center' });
    expect(row.dataset.returned).toBe('true');
    expect(container.querySelector<HTMLElement>('[data-signal-id="a"]')!.dataset.returned).toBeUndefined();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(row.dataset.returned).toBeUndefined();
    vi.useRealTimers();
  });

  it('does nothing without a returned signal', () => {
    const { container } = renderQueue(null);
    expect(container.querySelector('[data-returned]')).toBeNull();
  });
});
