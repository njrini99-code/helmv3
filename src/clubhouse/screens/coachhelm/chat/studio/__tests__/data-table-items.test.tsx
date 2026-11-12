import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { AskTable } from '../../../../../data/coachhelm-chat-thread';
import { DataTable, itemsOf, rangeOf, stateTone } from '../table';

/**
 * Owner, 2026-11-12, on the ruled grids of words in Ask's answers (tasks, tournaments, events: cut at the edge on a phone,
 * "Regula…", "Oct 30, 5 P…"): "I don't like those tables". A table of records is a list of items; a grid of figures stays a table.
 */
afterEach(cleanup);

const tasks: AskTable = {
  caption: '2 open tasks.',
  columns: ['Task', 'Due', 'Status', 'Priority'],
  rows: [
    ['Review Priya’s swing video', '—', 'Pending', 'Low'],
    ['Update the qualifier format', 'Nov 5', 'In progress', 'Regular'],
  ],
};
const events: AskTable = {
  caption: '2 events in the next 7 days.',
  columns: ['Title', 'Type', 'Starts', 'Ends'],
  rows: [
    ['Team practice', 'Practice', 'Oct 30, 3 PM', 'Oct 30, 5 PM'],
    ['Fall Invitational', 'Tournament', 'Oct 12', 'Oct 13'],
  ],
};
const standings: AskTable = {
  caption: 'Where everyone stands',
  columns: ['Player', 'SG Total', 'To par', 'Rounds'],
  rows: [['Jonah Okafor', '−0.4', '3.1', '4']],
};

describe('a table of records reads as items', () => {
  it('a title, its state as a chip, and one line that reads as a sentence', () => {
    expect(itemsOf(tasks)).toEqual([
      { title: 'Review Priya’s swing video', state: 'Pending', line: 'Low priority' },
      { title: 'Update the qualifier format', state: 'In progress', line: 'Due Nov 5 · Regular priority' },
    ]);
  });

  it('a start and an end are one range, the day said once when they share it', () => {
    expect(itemsOf(events).map((i) => i.line)).toEqual(['Practice · Oct 30, 3 PM – 5 PM', 'Tournament · Oct 12 – Oct 13']);
    expect(rangeOf('Nov 1, 8 AM', '—')).toBe('Nov 1, 8 AM');
    expect(rangeOf('—', 'Nov 3')).toBe('Until Nov 3');
  });

  it('a state is toned by what it means', () => {
    expect(stateTone('Done')).toBe('positive');
    expect(stateTone('In progress')).toBe('accent');
    expect(stateTone('Pending')).toBe('warning');
    expect(stateTone('Something new')).toBe('neutral');
  });

  it('draws as a named list of items, never a table', () => {
    render(<DataTable table={events} />);
    expect(screen.queryByRole('table')).toBeNull();
    const list = screen.getByRole('list', { name: '2 events in the next 7 days.' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Team practice');
    expect(items[0]).toHaveTextContent('Practice · Oct 30, 3 PM – 5 PM');
  });

  it('a state is drawn as the shared Badge', () => {
    const { container } = render(<DataTable table={tasks} />);
    expect([...container.querySelectorAll('.ch-badge')].map((b) => [b.textContent, b.className])).toEqual([
      ['Pending', 'ch-badge ch-badge--warning'],
      ['In progress', 'ch-badge ch-badge--accent'],
    ]);
  });
});

describe('a grid of figures, or a label and its value, stays a table', () => {
  it('two columns stay a table: a label and its value already read as a list', () => {
    render(<DataTable table={{ caption: 'Bag', columns: ['Club', 'Note'], rows: [['7-iron', 'New grips']] }} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('players against their figures is still a table, comparing is the point', () => {
    render(<DataTable table={standings} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
