/**
 * ============================================================================
 * FairwayJoinRequests — surface-exclusivity regression coverage
 * ----------------------------------------------------------------------------
 * The sole call site (FairwayCoachRoster.tsx) renders `<FairwayJoinRequests
 * requests={joinRequests} />` with NO overrides, so the component's own
 * defaults decide whether the inline accordion and the auto-popup modal ever
 * show the same expanded pending-request list at once. This locks the fix:
 * `defaultExpanded` defaults to the OPPOSITE of `enableModal` so exactly one
 * surface is expanded/prominent on first view, never both.
 *
 * Queries pass `{ hidden: true }` because Radix Dialog correctly aria-hides
 * the rest of the page from assistive tech while the modal is open (via the
 * `aria-hidden` lib's hideOthers) — that's desired a11y behavior, orthogonal
 * to the bug under test (a SIGHTED duplicate: the modal's scrim is low-alpha,
 * not blurred, so a still-expanded accordion is visually perceptible behind
 * it even though AT can no longer reach it).
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { JoinRequestData } from '@/app/golf/actions/teams';
import { FairwayJoinRequests } from './FairwayJoinRequests';

// Avoid pulling the 'use server' action's import graph (supabase server
// client, next/cache) into the jsdom test — same pattern as
// FairwayRecruitingPage.test.tsx mocking its server-action-backed child.
vi.mock('@/app/golf/actions/teams', () => ({
  acceptJoinRequest: vi.fn(async () => ({ success: true })),
  rejectJoinRequest: vi.fn(async () => ({ success: true })),
}));

function makeRequest(over: Partial<JoinRequestData> = {}): JoinRequestData {
  return {
    id: over.id ?? 'jr1',
    team_id: 't1',
    player_id: over.player_id ?? 'p1',
    status: 'pending',
    message: over.message ?? null,
    created_at: over.created_at ?? new Date().toISOString(),
    player: over.player ?? {
      id: 'p1',
      first_name: 'Jordan',
      last_name: 'Spieth',
      graduation_year: 2027,
      handicap: 2,
      hometown: 'Dallas',
      state: 'TX',
    },
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('surface exclusivity — default props (the live call site)', () => {
  it('starts the inline accordion COLLAPSED when the auto-popup modal owns first-touch', () => {
    render(<FairwayJoinRequests requests={[makeRequest()]} />);

    // The amber banner is always visible…
    expect(screen.getByText(/Pending join requests/i)).toBeInTheDocument();
    // …but collapsed, not pre-expanded — so the modal (which the mount effect
    // opens once per session) is the only surface showing the full list with
    // live Accept/Decline controls.
    const reviewToggle = screen.getByRole('button', { name: /^review$/i, hidden: true });
    expect(reviewToggle).toHaveAttribute('aria-expanded', 'false');

    // Exactly ONE "Accept" control exists in the DOM (the modal's) — the
    // accordion's row list isn't rendered at all while collapsed.
    expect(screen.getAllByRole('button', { name: /^accept$/i, hidden: true })).toHaveLength(1);
  });
});

describe('surface exclusivity — modal disabled', () => {
  it('starts the inline accordion EXPANDED when there is no modal (it is the only surface)', () => {
    render(<FairwayJoinRequests requests={[makeRequest()]} enableModal={false} />);

    const reviewToggle = screen.getByRole('button', { name: /^collapse$/i, hidden: true });
    expect(reviewToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('button', { name: /^accept$/i, hidden: true })).toHaveLength(1);
  });
});

describe('surface exclusivity — explicit override wins', () => {
  it('honors an explicit defaultExpanded even with the modal enabled', () => {
    render(<FairwayJoinRequests requests={[makeRequest()]} defaultExpanded />);

    // Both surfaces now show the list (caller opted in explicitly), so two
    // Accept controls in the DOM is the deliberate override behavior, not
    // the bug (the modal separately aria-hides the accordion from AT, which
    // is correct and unrelated to this component-level default).
    expect(screen.getAllByRole('button', { name: /^accept$/i, hidden: true })).toHaveLength(2);
  });
});
