/**
 * ============================================================================
 * FairwayRecruitingPage — premium-scrub remediation coverage
 * ----------------------------------------------------------------------------
 * Locks the live (flag-ON) Recruiting HQ behaviors fixed in the premium scrub:
 *
 *   P117  load-error renders a DISTINCT error surface with a working Retry, and
 *         NEVER the cheerful "Add your first prospect" empty-state CTA.
 *   P119  with zero recruits the funnel plates show de-emphasized, disabled
 *         zeros (not authoritative metrics) so the empty state is the message.
 *   P120  search has a trailing Clear control; a no-match state offers a single
 *         "Clear filters" reset of filter + search + sort.
 *   P124  the chosen sort persists to localStorage across mounts.
 *   P126  a visible "Sort" label accompanies the sort control.
 *   P127  a polite live region announces list updates and focus returns to the
 *         stable "Add prospect" control after a save closes the sheet.
 *
 * Renders the REAL page + REAL Fairway primitives. Mocks only next/navigation
 * (router.refresh is a no-op) and the child form sheet (to avoid vaul + the
 * server-action import graph) — exposing its onSaved/onClose as plain buttons so
 * the save→close→refocus flow is genuinely exercised.
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

import type { Recruit } from '@/app/golf/actions/recruiting';
import { FairwayRecruitingPage } from './FairwayRecruitingPage';

// ── Router (refresh is a no-op in the test) ────────────────────────────────
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

// ── Child form sheet: expose onSaved/onClose as plain buttons, no vaul / no
//    server-action import graph. The page's focus + announce logic is the SUT. ─
vi.mock('./FairwayRecruitFormSheet', () => ({
  FairwayRecruitFormSheet: ({
    open,
    onSaved,
    onClose,
  }: {
    open: boolean;
    onSaved: () => void;
    onClose: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label="prospect form">
        {/* mimic the real sheet: onSaved() then onClose() */}
        {/* eslint-disable-next-line helm/no-raw-button */}
        <button
          type="button"
          onClick={() => {
            onSaved();
            onClose();
          }}
        >
          mock-save
        </button>
      </div>
    ) : null,
}));

function makeRecruit(over: Partial<Recruit> = {}): Recruit {
  return {
    id: over.id ?? 'r1',
    team_id: 't1',
    first_name: over.first_name ?? 'Jordan',
    last_name: over.last_name ?? 'Spieth',
    hs_class: over.hs_class ?? 2027,
    email: over.email ?? null,
    phone: over.phone ?? null,
    hometown: over.hometown ?? 'Dallas',
    state: over.state ?? 'TX',
    notes: over.notes ?? null,
    status: over.status ?? 'recruiting',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: over.updated_at ?? '2026-06-01T00:00:00.000Z',
  };
}

// jsdom in this project's vitest config doesn't ship a localStorage — provide a
// minimal in-memory shim so the useLocalStorage persistence path is exercised.
function installLocalStorage() {
  const store = new Map<string, string>();
  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    removeItem: (k: string) => store.delete(k),
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
  };
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true, writable: true });
}

beforeEach(() => {
  refresh.mockClear();
  installLocalStorage();
});

describe('P117 — load-error surface', () => {
  it('renders a distinct error notice with a working Retry and NO "add your first prospect" CTA', () => {
    render(<FairwayRecruitingPage initialRecruits={[]} loadError="Couldn’t reach the server." />);

    // distinct error surface
    expect(screen.getByText(/Couldn’t load your prospect list/i)).toBeInTheDocument();
    // working retry → router.refresh
    const retry = screen.getByRole('button', { name: /try again/i });
    fireEvent.click(retry);
    expect(refresh).toHaveBeenCalledTimes(1);

    // the cheerful empty CTA must NOT mask the failure
    expect(screen.queryByRole('button', { name: /add your first prospect/i })).toBeNull();
    // and the empty-state title is suppressed too
    expect(screen.queryByText(/Start your prospect list/i)).toBeNull();
  });
});

describe('P119 — zero-data funnel honesty', () => {
  it('renders de-emphasized, disabled zero plates when there are no recruits', () => {
    render(<FairwayRecruitingPage initialRecruits={[]} />);

    // a status plate exists for each status…
    const watched = screen.getByRole('button', { name: /Watched/i });
    // …but is disabled (nothing to filter to)
    expect(watched).toBeDisabled();

    // the count is rendered, but de-emphasized (not the authoritative primary color)
    const watchedCount = within(watched).getByText('0');
    expect(watchedCount.className).toMatch(/text-text-tertiary/);
    expect(watchedCount.className).not.toMatch(/text-text-primary/);

    // the empty state is the single message
    expect(screen.getByText(/Start your prospect list/i)).toBeInTheDocument();
  });

  it('renders authoritative (primary-colored), enabled plates once data exists', () => {
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit({ status: 'recruiting' })]} />);
    const recruiting = screen.getByRole('button', { name: /Recruiting/i });
    expect(recruiting).not.toBeDisabled();
    expect(within(recruiting).getByText('1').className).toMatch(/text-text-primary/);
  });
});

describe('P120 — search clear + unified reset', () => {
  it('shows a Clear-search control only when the search has text, and clears it', () => {
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit()]} />);

    const input = screen.getByRole('searchbox', { name: /search prospects/i });
    // no clear button at rest
    expect(screen.queryByRole('button', { name: /clear search/i })).toBeNull();

    fireEvent.change(input, { target: { value: 'nobody-matches-this' } });
    const clear = screen.getByRole('button', { name: /clear search/i });
    fireEvent.click(clear);
    expect((input as HTMLInputElement).value).toBe('');
  });

  it('offers a single "Clear filters" reset in the no-match state that resets filter+search+sort', () => {
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit()]} />);
    const input = screen.getByRole('searchbox', { name: /search prospects/i });

    fireEvent.change(input, { target: { value: 'zzz-no-match' } });
    expect(screen.getByText(/No prospects match/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /clear filters/i }));
    // search is cleared → the card is visible again, no-match gone
    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryByText(/No prospects match/i)).toBeNull();
    // the prospect card is back (its edit affordance carries the prospect name)
    expect(screen.getByRole('button', { name: /Edit Jordan Spieth/i })).toBeInTheDocument();
  });
});

describe('P124 — sort/filter preference persistence', () => {
  it('persists the chosen sort to localStorage', async () => {
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit()]} />);
    // pick "Name A–Z" (Radix ToggleGroup single-select → role="radio")
    fireEvent.click(screen.getByRole('radio', { name: /Name A–Z/i }));
    await waitFor(() =>
      expect(window.localStorage.getItem('fw-recruiting-sort')).toBe(JSON.stringify('name')),
    );
  });

  it('restores a persisted sort on a fresh mount', () => {
    window.localStorage.setItem('fw-recruiting-sort', JSON.stringify('name'));
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit()]} />);
    // the "Name A–Z" segment is the selected one
    const nameSeg = screen.getByRole('radio', { name: /Name A–Z/i });
    expect(nameSeg).toHaveAttribute('aria-checked', 'true');
  });
});

describe('P126 — visible Sort label', () => {
  it('renders a visible "Sort" label next to the sort control', () => {
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit()]} />);
    expect(screen.getByText('Sort')).toBeInTheDocument();
  });
});

describe('P127 — focus management + SR announcement on save', () => {
  it('exposes a polite live region and returns focus to "Add prospect" after a save', async () => {
    render(<FairwayRecruitingPage initialRecruits={[makeRecruit()]} />);

    // a polite live region exists for SR cues
    const live = screen
      .getAllByRole('status')
      .find((el) => el.getAttribute('aria-live') === 'polite' && el.className.includes('sr-only'));
    expect(live).toBeTruthy();

    // open the (mocked) sheet, then save
    fireEvent.click(screen.getByRole('button', { name: /^Add prospect$/i }));
    fireEvent.click(screen.getByRole('button', { name: /mock-save/i }));

    // the list-updated announcement is set
    await waitFor(() => expect(live).toHaveTextContent(/Prospect list updated\./i));

    // focus returns to the stable Add control (not document.body)
    const addBtn = screen.getByRole('button', { name: /^Add prospect$/i });
    await waitFor(() => expect(document.activeElement).toBe(addBtn));
    // refresh was triggered (server-truth re-fetch)
    expect(refresh).toHaveBeenCalled();
  });
});
