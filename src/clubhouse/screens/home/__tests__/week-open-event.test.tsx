import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/golf/dashboard', useSearchParams: () => new URLSearchParams() }));

import { PREVIEW_HOME } from '../../../preview/fixtures';
import { Week } from '../Week';
import { eventHref } from '../event-links';

/**
 * Review of lay-01 (16 Nov 2026): the coach's desktop Today list linked each event; the player's Week it now uses drew
 * them as plain text. The coach's today rows open their event again; a row with no event behind it (the player's) stays text.
 */
describe('This week, today rows', () => {
  const week = PREVIEW_HOME.week;
  const events = PREVIEW_HOME.phone.today;
  const today = week.agenda.filter((r) => r.when === 'today');

  it('opens each of the coach’s today events', () => {
    const linked = today.filter((r) => events.some((e) => e.id === r.id));
    expect(linked.length).toBeGreaterThan(0);
    const { container } = render(<Week week={week} events={events} />);
    const hrefs = [...container.querySelectorAll('a.ch-h-agenda__open')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(linked.map((r) => eventHref(events.find((e) => e.id === r.id)!)));
  });

  it('keeps the rows as text without events (the player’s Week)', () => {
    const { container } = render(<Week week={week} />);
    expect(container.querySelector('a.ch-h-agenda__open')).toBeNull();
    expect(container.querySelectorAll('.ch-h-agenda__a').length).toBe(week.agenda.length);
  });
});
