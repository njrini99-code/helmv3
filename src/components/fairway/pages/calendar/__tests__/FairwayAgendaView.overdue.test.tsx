/**
 * FairwayAgendaView: the pinned "N overdue tasks" row (owner decision).
 * Shows the count, links to Tasks, sits first in the agenda, survives the
 * honest-empty branch, and is absent at 0 so the agenda's DOM is unchanged.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import type { CalendarEvent } from '@/hooks/useCalendarEvents';
import { FairwayAgendaView, OVERDUE_TASKS_HREF } from '../FairwayAgendaView';

const TEAM_TZ = 'America/New_York';

function makeEvent(id: string, startIso: string): CalendarEvent {
  return {
    id,
    team_id: 'team-1',
    title: `Event ${id}`,
    event_type: 'practice',
    start_date: startIso,
    end_date: startIso,
    start_time: startIso,
    end_time: startIso,
    location: null,
    description: null,
  } as CalendarEvent;
}

const baseProps = {
  mode: 'range' as const,
  focusDate: new Date(2026, 6, 16),
  rangeStart: new Date(2026, 6, 1),
  rangeEnd: new Date(2026, 6, 31),
  periodLabel: 'July 2026',
  isCoach: false,
  timezone: TEAM_TZ,
  nowRef: new Date(2026, 6, 16, 12),
};

const oneEvent = [makeEvent('e1', '2026-07-20T16:00:00.000Z')];

describe('FairwayAgendaView overdue row', () => {
  it('shows the overdue count and links to Tasks', () => {
    const { container } = render(<FairwayAgendaView {...baseProps} events={oneEvent} overdueTaskCount={3} />);
    const row = container.querySelector('[data-slot="agenda-overdue"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('3 overdue tasks');
    expect(row!.tagName).toBe('A');
    expect(row!.getAttribute('href')).toBe('/golf/dashboard/tasks');
    expect(OVERDUE_TASKS_HREF).toBe('/golf/dashboard/tasks');
  });

  it('uses the singular for one task', () => {
    const { container } = render(<FairwayAgendaView {...baseProps} events={oneEvent} overdueTaskCount={1} />);
    expect(container.querySelector('[data-slot="agenda-overdue"]')!.textContent).toContain('1 overdue task');
    expect(container.querySelector('[data-slot="agenda-overdue"]')!.textContent).not.toContain('tasks');
  });

  it('is pinned first, above the day groups', () => {
    const { container } = render(<FairwayAgendaView {...baseProps} events={oneEvent} overdueTaskCount={2} />);
    const row = container.querySelector('[data-slot="agenda-overdue"]')!;
    const firstSection = container.querySelector('section')!;
    expect(row.compareDocumentPosition(firstSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is hidden at 0 and leaves the agenda DOM unchanged', () => {
    const withZero = render(<FairwayAgendaView {...baseProps} events={oneEvent} overdueTaskCount={0} />);
    expect(withZero.container.querySelector('[data-slot="agenda-overdue"]')).toBeNull();
    const zeroHtml = withZero.container.innerHTML;
    withZero.unmount();
    const without = render(<FairwayAgendaView {...baseProps} events={oneEvent} />);
    expect(without.container.innerHTML).toBe(zeroHtml);
  });

  it('still shows when the month has no events', () => {
    const { container, getByText } = render(<FairwayAgendaView {...baseProps} events={[]} overdueTaskCount={4} />);
    expect(container.querySelector('[data-slot="agenda-overdue"]')!.textContent).toContain('4 overdue tasks');
    expect(getByText('Nothing in July 2026')).toBeTruthy();
  });
});
