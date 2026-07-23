// @vitest-environment jsdom
/**
 * ============================================================================
 * RosterPlayerCard — the phone-native roster row (audit W2)
 * ----------------------------------------------------------------------------
 * Bug: below `sm`, the roster's ONLY presentation was the desktop DataTable
 * squeezed to a 390px viewport — Player/Avg score/Trend stayed visible but
 * the Focus-status / "Add focus area" / "View genome" columns clipped off
 * the right edge, and DataTable's row-action buttons only reveal on
 * hover/focus-within (no hover on touch), so a coach on a phone had no way
 * to reach either action from the roster.
 *
 * Fix: PlayersGridView now renders RosterPlayerCard for < sm — a native card
 * with identity + avg score + trend, and "Add focus area" / "View genome" as
 * their own always-visible <Button>s below a divider (not a hover-revealed
 * column). This locks in that those two actions render as real, always-
 * present buttons — never nested inside a <table> where they'd be subject to
 * the table's auto-layout squeeze — and that each calls its own handler.
 * ========================================================================== */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { PlayersGridView, RosterPlayerCard, type RosterRow } from './PlayersGridView';

// ── shell — pure chrome (nav rail, breadcrumb, title). Not the SUT below. ──
vi.mock('./CoachHelmShell', () => ({
  CoachHelmShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

// ── the create/edit modal is closed by default in every test below; stub it
//    out so mounting PlayersGridView doesn't drag in its own form-lifecycle
//    dependency tree for a suite that never opens it. ──────────────────────
vi.mock('./FocusAreaModal', () => ({
  FocusAreaModal: () => null,
}));

// ── every server action PlayersGridView imports — none are invoked by simply
//    mounting the roster (they only fire from user interactions this suite
//    doesn't exercise), stubbed so the import itself resolves in jsdom. ────
vi.mock('@/app/golf/actions/development', () => ({
  createFocusArea: vi.fn(),
  updateFocusArea: vi.fn(),
  completeFocusArea: vi.fn(),
  deleteFocusArea: vi.fn(),
  updateFocusAreaProgress: vi.fn(),
  recordFocusAreaOutcome: vi.fn(),
  reactivateFocusArea: vi.fn(),
}));

function makeRow(overrides: Partial<RosterRow['player']> = {}): RosterRow {
  return {
    player: {
      id: 'p1',
      first_name: 'Jordan',
      last_name: 'Lee',
      avatar_url: null,
      graduation_year: 2027,
      handicap: 2,
      hometown: null,
      state: null,
      ...overrides,
    },
    stats: {
      rounds_played: 5,
      avg_score: 74.2,
      avg_putts: null,
      fairway_pct: null,
      gir_pct: null,
      best_score: null,
      recent_trend: 'improving',
    },
    activeCount: 1,
    completedCount: 0,
  };
}

describe('RosterPlayerCard — always-visible, non-table tap targets', () => {
  it('renders identity, avg score and trend, plus Add focus area / Game fingerprint / View genome as real buttons', () => {
    render(
      <RosterPlayerCard
        row={makeRow()}
        muted={false}
        onOpenAreas={vi.fn()}
        onAddFocusArea={vi.fn()}
        onGameFingerprint={vi.fn()}
        onViewGenome={vi.fn()}
      />,
    );

    // The Avatar's own sr-only fallback text also matches "Jordan Lee" —
    // assert at least one visible instance rather than picking one query.
    expect(screen.getAllByText('Jordan Lee').length).toBeGreaterThan(0);
    expect(screen.getByText('74.2')).toBeInTheDocument();

    const addButton = screen.getByRole('button', { name: 'Add focus area' });
    const fingerprintButton = screen.getByRole('button', { name: 'Game fingerprint' });
    const genomeButton = screen.getByRole('button', { name: 'View genome' });

    // Real, always-present controls — not a hover-only reveal, and not a
    // descendant of a <table> (the desktop DataTable's own action column).
    expect(addButton.closest('table')).toBeNull();
    expect(fingerprintButton.closest('table')).toBeNull();
    expect(genomeButton.closest('table')).toBeNull();
    // Never opacity-gated on rest — the DataTable row-action treatment this
    // replaces starts at `opacity-0` until hover/focus-within.
    expect(addButton.className).not.toMatch(/opacity-0/);
    expect(fingerprintButton.className).not.toMatch(/opacity-0/);
    expect(genomeButton.className).not.toMatch(/opacity-0/);
  });

  it('routes each tap target to its own handler, independent of the card body', async () => {
    const user = userEvent.setup();
    const onOpenAreas = vi.fn();
    const onAddFocusArea = vi.fn();
    const onGameFingerprint = vi.fn();
    const onViewGenome = vi.fn();

    render(
      <RosterPlayerCard
        row={makeRow()}
        muted={false}
        onOpenAreas={onOpenAreas}
        onAddFocusArea={onAddFocusArea}
        onGameFingerprint={onGameFingerprint}
        onViewGenome={onViewGenome}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Add focus area' }));
    expect(onAddFocusArea).toHaveBeenCalledTimes(1);
    expect(onOpenAreas).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Game fingerprint' }));
    expect(onGameFingerprint).toHaveBeenCalledTimes(1);
    expect(onOpenAreas).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'View genome' }));
    expect(onViewGenome).toHaveBeenCalledTimes(1);
    expect(onOpenAreas).not.toHaveBeenCalled();

    // The card's identity row is its own (unlabeled) button — the FIRST button
    // in the card, ahead of the three named action buttons already asserted.
    const openAreasButton = screen.getAllByRole('button')[0]!;
    await user.click(openAreasButton);
    expect(onOpenAreas).toHaveBeenCalledTimes(1);
  });

  it('shows the "Insights muted" badge only when the player has a silent alert posture', () => {
    const { rerender } = render(
      <RosterPlayerCard
        row={makeRow()}
        muted={false}
        onOpenAreas={vi.fn()}
        onAddFocusArea={vi.fn()}
        onGameFingerprint={vi.fn()}
        onViewGenome={vi.fn()}
      />,
    );
    expect(screen.queryByText('Insights muted')).toBeNull();

    rerender(
      <RosterPlayerCard
        row={makeRow()}
        muted
        onOpenAreas={vi.fn()}
        onAddFocusArea={vi.fn()}
        onGameFingerprint={vi.fn()}
        onViewGenome={vi.fn()}
      />,
    );
    expect(screen.getByText('Insights muted')).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------------
 * PlayersGridView — desktop DataTable row actions are static (#191/#200)
 * ---------------------------------------------------------------------------
 * Bug: the desktop `sm+` roster table (intentionally left unchanged by the
 * mobile-card W2 fix above) passed "Add focus area" / "View genome" through
 * DataTable's built-in `rowActions` slot, which renders `opacity-0` at rest
 * and only reaches `opacity-100` via `group-hover/row` or
 * `group-focus-within/row` — a mouse-hover reveal with no STATIC affordance
 * for a non-mouse desktop user (keyboard-only or screen-reader) scanning the
 * table cold, before any row has focus.
 *
 * Fix: those two actions now render as an ordinary column cell (real
 * `IconButton`s, no opacity-gating CSS) — always painted, always in the
 * accessibility tree, reachable by Tab with no hover or prior focus needed.
 * ------------------------------------------------------------------------- */
describe('PlayersGridView — desktop roster table row actions are always visible', () => {
  const basePlayer = {
    id: 'p1',
    first_name: 'Jordan',
    last_name: 'Lee',
    avatar_url: null,
    graduation_year: 2027,
    handicap: 2,
    hometown: null,
    state: null,
  };

  function renderGrid() {
    return render(
      <PlayersGridView
        players={[basePlayer]}
        focusAreas={[]}
        coachId="coach-1"
        playerStats={{}}
      />,
    );
  }

  it('renders "Add focus area" / "Game fingerprint" / "View genome" as real, always-visible buttons inside the desktop table', () => {
    renderGrid();

    const table = screen.getByRole('table');
    const addButton = within(table).getByRole('button', { name: "Add focus area for Jordan Lee" });
    const fingerprintButton = within(table).getByRole('button', { name: "Open Jordan Lee's game fingerprint" });
    const genomeButton = within(table).getByRole('button', { name: "View Jordan Lee's genome" });

    // Real controls, inside the <table> (the desktop path this bug is scoped
    // to) — never opacity-gated on rest, unlike the DataTable `rowActions`
    // treatment they replace.
    expect(addButton.className).not.toMatch(/opacity-0/);
    expect(fingerprintButton.className).not.toMatch(/opacity-0/);
    expect(genomeButton.className).not.toMatch(/opacity-0/);
    expect(addButton.className).not.toMatch(/group-hover/);
    expect(fingerprintButton.className).not.toMatch(/group-hover/);
    expect(genomeButton.className).not.toMatch(/group-hover/);
  });

  it('reaches all three row actions via Tab with no prior hover/focus on the row', async () => {
    const user = userEvent.setup();
    renderGrid();

    const table = screen.getByRole('table');
    const addButton = within(table).getByRole('button', { name: "Add focus area for Jordan Lee" });
    const fingerprintButton = within(table).getByRole('button', { name: "Open Jordan Lee's game fingerprint" });
    const genomeButton = within(table).getByRole('button', { name: "View Jordan Lee's genome" });

    // Tab through the document until each action is reached — no hover event
    // is ever dispatched, mirroring a keyboard-only or screen-reader user.
    for (let i = 0; i < 30 && document.activeElement !== addButton; i += 1) {
      await user.tab();
    }
    expect(document.activeElement).toBe(addButton);

    await user.tab();
    expect(document.activeElement).toBe(fingerprintButton);

    await user.tab();
    expect(document.activeElement).toBe(genomeButton);
  });
});
