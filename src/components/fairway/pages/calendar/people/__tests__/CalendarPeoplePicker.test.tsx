// @vitest-environment jsdom

/**
 * CalendarPeoplePicker — SCREEN-BUILD-PLAN.md §2.3 (S3).
 *
 * The global test-setup `matchMedia` mock reports `matches: false` for every
 * query, so these tests exercise the mobile `ModalShell` shell (the required
 * 320px case) by default; one test opts into the desktop `PopoverPanel`
 * shell the same way `ModalShell.coarse-pointer-focus.test.tsx` does.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarPeoplePicker, type PeoplePickerPerson } from '../CalendarPeoplePicker';

const realMatchMedia = window.matchMedia;
function mockDesktop() {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 1024px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
afterEach(() => {
  Object.defineProperty(window, 'matchMedia', { writable: true, value: realMatchMedia });
});

const roster: PeoplePickerPerson[] = [
  { id: 'p1', name: 'Ava Stone', role: 'Player' },
  { id: 'p2', name: 'Ben Cortez', role: 'Player' },
  { id: 'p3', name: 'Cam Reyes', role: 'Coach' },
];

describe('CalendarPeoplePicker — 320px roster and search', () => {
  it('renders every roster row and the initial selected count', () => {
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={['p1']}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
      />,
    );
    expect(screen.getByRole('option', { name: /Ava Stone/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Ben Cortez/ })).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('filters by name and offers a Clear search when nothing matches', async () => {
    const user = userEvent.setup();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
      />,
    );
    await user.type(screen.getByRole('searchbox', { name: 'Search people' }), 'zzz-nobody');
    expect(screen.getByText(/No one matches/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('option', { name: /Ava Stone/ })).toBeInTheDocument();
  });

  it('shows an EmptyState for an empty roster instead of a blank list', () => {
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={[]}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
        emptyMessage="No players on this team yet."
      />,
    );
    expect(screen.getByText('No players on this team yet.')).toBeInTheDocument();
  });
});

describe('CalendarPeoplePicker — selection', () => {
  it('toggles a row on click and updates the selected count with no onApply yet', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={onApply}
      />,
    );
    await user.click(screen.getByRole('option', { name: /Ben Cortez/ }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('Select shown selects every currently-filtered row, Clear shown reverses it', async () => {
    const user = userEvent.setup();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Select shown' }));
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear shown' }));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('Done applies the exact selected id set and closes the picker', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={onOpenChange}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={['p1']}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={onApply}
      />,
    );
    await user.click(screen.getByRole('option', { name: /Cam Reyes/ }));
    await user.click(screen.getByRole('button', { name: 'Compare selected' }));
    expect(onApply).toHaveBeenCalledWith(['p1', 'p3'], { requiredIds: [] });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Cancel closes without applying an edit made in the picker', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={onOpenChange}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={['p1']}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={onApply}
      />,
    );
    await user.click(screen.getByRole('option', { name: /Ben Cortez/ }));
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onApply).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not block selecting more than eight people (no silent cap — #1470)', async () => {
    const user = userEvent.setup();
    const bigRoster = Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, name: `Member ${i}` }));
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={bigRoster}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Select shown' }));
    expect(screen.getByText('10 selected')).toBeInTheDocument();
  });
});

describe('CalendarPeoplePicker — compare mode required/optional', () => {
  it('shows the Required/Optional toggle only for a selected row in compare mode', async () => {
    const user = userEvent.setup();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={[]}
        mode="compare"
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
      />,
    );
    expect(screen.queryByLabelText('Optional')).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Ava Stone/ }));
    expect(screen.getByLabelText('Optional')).toBeInTheDocument();
    expect(screen.getByLabelText('Required')).toBeInTheDocument();
  });

  it('never shows Required/Optional in invite mode', async () => {
    const user = userEvent.setup();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Invite</button>}
        people={roster}
        selectedIds={[]}
        mode="invite"
        title="Invite players"
        doneLabel="Apply attendees"
        onApply={() => {}}
      />,
    );
    await user.click(screen.getByRole('option', { name: /Ava Stone/ }));
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
    expect(screen.queryByText('Optional')).not.toBeInTheDocument();
  });
});

describe('CalendarPeoplePicker — keyboard', () => {
  it('Arrow keys move focus, Space toggles, Enter applies', () => {
    const onApply = vi.fn();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={onApply}
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'People' });
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    fireEvent.keyDown(listbox, { key: ' ' });
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onApply).toHaveBeenCalledWith(['p2'], { requiredIds: [] });
  });
});

describe('CalendarPeoplePicker — desktop shell', () => {
  it('renders the same roster inside the anchored popover at ≥1024px', () => {
    mockDesktop();
    render(
      <CalendarPeoplePicker
        open
        onOpenChange={() => {}}
        trigger={<button type="button">Compare</button>}
        people={roster}
        selectedIds={[]}
        title="Compare schedules"
        doneLabel="Compare selected"
        onApply={() => {}}
      />,
    );
    expect(screen.getByRole('option', { name: /Ava Stone/ })).toBeInTheDocument();
  });
});
