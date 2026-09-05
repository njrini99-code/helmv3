/**
 * S5 regression pin — the End time field must stay reachable.
 *
 * THE BUG. The editor used to end in a `ModalShell.Footer` carrying three
 * actions: "Cancel event", "Cancel" and "Create event". `ModalShell.Footer`
 * is `flex-col-reverse` below `sm`, so on a phone those stack full-width into
 * a button bar measured at 194px. A flex item's automatic minimum size is
 * content-based, so that bar CANNOT shrink — while `ModalShell.Body`
 * (`min-h-0 flex-auto overflow-y-auto`) can. Every pixel the viewport lost
 * therefore came out of the FORM.
 *
 * Measured in Chromium against a mirror of that exact geometry
 * (panel/header/body/footer class strings copied from ModalShell.tsx):
 *
 *   390x844, keyboard down   panel 812 = header 72 + body 546 + footer 194
 *   390x844, keyboard UP     panel 476 = header 72 + body 210 + footer 194
 *   375x667, keyboard UP     panel 335 = header 72 + body  69 + footer 194
 *   844x390 landscape + kb   panel 158 = header 72 + body  40 + footer  86
 *
 * A 69px scroll window under a 194px button bar is the reported "End time is
 * cut off behind the button bar": the field is technically in the DOM and
 * technically scrollable, and there is no room to show it.
 *
 * THE INVARIANT this file pins, which is structural and therefore checkable
 * in jsdom (which has no layout):
 *
 *   1. the editor renders NO ModalShell.Footer — there is no button bar left
 *      to squeeze the form or to hide a field behind;
 *   2. the End time control lives inside ModalShell.Body, the one scroll
 *      region;
 *   3. nothing between that control and the Body caps its height (a fixed
 *      `h-[...]`/`max-h-[...]` ancestor is the OTHER way this symptom is
 *      produced — see `MobileEventSheet`'s `max-h-[calc(90vh-180px)]` inside
 *      a `90dvh` sheet);
 *   4. the primary action is chrome, outside the Body, so it can neither
 *      scroll away nor take height from the form.
 *
 * WHAT IT DOES NOT COVER: real pixels (jsdom has none — the numbers above came
 * from Chromium), and the End-time PopoverPanel list, which is portalled and
 * positioned by Radix outside this tree.
 *
 * ModalShell is mocked the same way FairwayEventEditor.scope.test.tsx and
 * FairwayCreateTaskModal.layout.test.tsx mock it: real Radix/framer-motion
 * behaviour is not under test, only the call-site composition.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as React from 'react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';

vi.mock('@/components/fairway/overlays/ModalShell', () => {
  interface ShellProps {
    open: boolean;
    title?: React.ReactNode;
    hideTitle?: boolean;
    children?: React.ReactNode;
  }
  function ModalShellRoot({ open, children }: ShellProps) {
    return open ? <div role="dialog">{children}</div> : null;
  }
  ModalShellRoot.Body = function Body({
    children,
    className,
  }: {
    children?: React.ReactNode;
    className?: string;
  }) {
    return (
      <div data-testid="mock-modal-body" className={className}>
        {children}
      </div>
    );
  };
  ModalShellRoot.Footer = function Footer({ children }: { children?: React.ReactNode }) {
    return <div data-testid="mock-modal-footer">{children}</div>;
  };
  return { ModalShell: ModalShellRoot };
});

vi.mock('@/components/fairway/forms/Switch', () => ({
  Switch: ({ checked, label }: { checked?: boolean; label?: React.ReactNode }) => (
    <label>
      <input type="checkbox" readOnly checked={Boolean(checked)} />
      {label}
    </label>
  ),
}));

vi.mock('../FairwayCalendarMemberRail', () => ({
  tintFor: () => ({ bg: '#eef', text: '#225' }),
}));

vi.mock('@/app/golf/actions/golf', () => ({
  getEventRSVP: vi.fn(async () => ({
    success: true,
    data: {
      summary: { accepted: 0, declined: 0, tentative: 0, pending: 0, total: 0, attendees: [] },
    },
  })),
  checkScheduleConflicts: vi.fn(async () => ({ success: true, data: null })),
}));

import { FairwayEventEditor } from '../FairwayEventEditor';

function renderEditor(event: CalendarEvent | null = null) {
  render(
    <FairwayEventEditor
      open
      onClose={vi.fn()}
      event={event}
      isCoach
      onSave={vi.fn(async () => {})}
      onDelete={vi.fn(async () => {})}
      isSaving={false}
      teamPlayers={[{ id: 'p1', first_name: 'Ava', last_name: 'Stone' }]}
      currentUserId="coach-1"
    />,
  );
}

/** The End-time control is the popover trigger labelled "End time". */
function endTimeControl(): HTMLElement {
  return screen.getByRole('button', { name: 'End time' });
}

describe('FairwayEventEditor — the End time field cannot be clipped', () => {
  it('renders no footer button bar at all', () => {
    renderEditor();
    expect(screen.queryByTestId('mock-modal-footer')).toBeNull();
    // ...and specifically not the redundant dismiss it used to carry: the X
    // is the only dismiss now.
    expect(screen.queryByRole('button', { name: /^Cancel$/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('keeps the End time control inside the one scroll region', () => {
    renderEditor();
    const body = screen.getByTestId('mock-modal-body');
    expect(body).toContainElement(endTimeControl());
  });

  it('caps the height of nothing between the End time control and the scroll region', () => {
    renderEditor();
    const body = screen.getByTestId('mock-modal-body');

    const capped: string[] = [];
    for (let el = endTimeControl().parentElement; el && el !== body; el = el.parentElement) {
      const cls = el.className ?? '';
      if (typeof cls === 'string' && /(^|[\s:])(max-)?h-\[/.test(cls)) capped.push(cls);
      if (el.style.height || el.style.maxHeight) capped.push(el.getAttribute('style') ?? '');
    }
    expect(capped).toEqual([]);
  });

  it('puts the primary action in the header, outside the scrolling form', () => {
    renderEditor();
    const body = screen.getByTestId('mock-modal-body');
    const create = screen.getByRole('button', { name: /create event/i });
    expect(create).toBeInTheDocument();
    expect(body).not.toContainElement(create);
    // The dismiss is chrome too — neither competes with the form for height.
    expect(body).not.toContainElement(screen.getByRole('button', { name: 'Close' }));
  });

  it('still shows both time fields when the event is not all-day', () => {
    renderEditor();
    expect(screen.getByRole('button', { name: 'Start time' })).toBeInTheDocument();
    expect(endTimeControl()).toBeInTheDocument();
  });
});
