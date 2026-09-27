import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DragEndEvent } from '@dnd-kit/core';

/**
 * DATA-10 — the ranker must keep a dragged order across parent re-renders
 * that pass a fresh `values` literal with the SAME saved order (the parent
 * re-renders when its save flips `saving`), and resync only when the saved
 * order itself changes.
 *
 * jsdom has no layout, so a real pointer/keyboard drag cannot resolve drop
 * targets. DndContext is replaced with a pass-through that captures
 * `onDragEnd`, and the test fires that handler directly with the event
 * dnd-kit would have produced.
 */

const { dragEnd } = vi.hoisted(() => ({
  dragEnd: { current: null as null | ((event: DragEndEvent) => void) },
}));

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: React.ReactNode;
      onDragEnd?: (event: DragEndEvent) => void;
    }) => {
      dragEnd.current = onDragEnd ?? null;
      return <>{children}</>;
    },
  };
});

vi.mock('@/lib/utils/capacitor', () => ({
  triggerHaptic: vi.fn(async () => undefined),
}));

import { PriorityRanker } from '../PriorityRanker';

const saved = {
  priorityBallStriking: 1,
  priorityShortGame: 2,
  priorityPutting: 3,
  priorityCourseManagement: 4,
  priorityMentalGame: 5,
};

function order(): string[] {
  const labels = ['Ball Striking', 'Short Game', 'Putting', 'Course Management', 'Mental Game'];
  return screen
    .getAllByText((_, el) => !!el && el.tagName === 'DIV' && labels.includes(el.textContent ?? '') && el.children.length === 0)
    .map((el) => el.textContent ?? '');
}

function drag(activeId: string, overId: string) {
  act(() => {
    dragEnd.current?.({
      active: { id: activeId },
      over: { id: overId },
    } as unknown as DragEndEvent);
  });
}

describe('PriorityRanker (DATA-10)', () => {
  it('keeps the dragged order when the parent re-renders with a fresh literal of the same saved order', () => {
    const onChange = vi.fn();
    const view = render(<PriorityRanker values={{ ...saved }} onChange={onChange} />);
    expect(order()).toEqual(['Ball Striking', 'Short Game', 'Putting', 'Course Management', 'Mental Game']);

    drag('priorityPutting', 'priorityBallStriking');
    expect(onChange).toHaveBeenCalledWith({
      priorityPutting: 1,
      priorityBallStriking: 2,
      priorityShortGame: 3,
      priorityCourseManagement: 4,
      priorityMentalGame: 5,
    });
    const dragged = ['Putting', 'Ball Striking', 'Short Game', 'Course Management', 'Mental Game'];
    expect(order()).toEqual(dragged);

    // Parent re-renders while the save is in flight: new object, same order.
    view.rerender(<PriorityRanker values={{ ...saved }} onChange={onChange} />);
    view.rerender(<PriorityRanker values={{ ...saved }} onChange={onChange} />);
    expect(order()).toEqual(dragged);
  });

  it('resyncs when the saved order itself changes', () => {
    const onChange = vi.fn();
    const view = render(<PriorityRanker values={{ ...saved }} onChange={onChange} />);

    view.rerender(
      <PriorityRanker
        values={{ ...saved, priorityBallStriking: 5, priorityMentalGame: 1 }}
        onChange={onChange}
      />,
    );
    expect(order()).toEqual(['Mental Game', 'Short Game', 'Putting', 'Course Management', 'Ball Striking']);
  });
});
