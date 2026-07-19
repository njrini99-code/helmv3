/**
 * ============================================================================
 * FairwayDocuments — player-visibility parity evidence (#151 follow-up)
 * ----------------------------------------------------------------------------
 * #151 reported the player Documents page reading as "completely empty" while
 * two OTHER player-facing surfaces (Calendar event attachments via
 * `getEventDocuments` in event-documents.ts, and Announcement attachments via
 * the `golf_announcement_documents` → `golf_documents` lookup in
 * announcements.ts) imply documents exist for the team.
 *
 * Root-caused: the page (documents/page.tsx) correctly scopes players to
 * `.eq('is_public', true)` before this component ever mounts — that part of
 * the pipeline is NOT the bug. The seeded team's 4 documents are all
 * `is_public=false` (coach-only), so an honest, correctly-filtered player
 * feed IS empty. The parity gap lives entirely in the two OTHER surfaces:
 * neither `getEventDocuments` (event-documents.ts) nor the announcement doc
 * lookup (announcements.ts) filters attached/linked golf_documents by
 * is_public before showing them to players, so a coach-only doc attached to
 * an event or announcement still surfaces its title/description to players —
 * inconsistent with (and a mild visibility leak against) what this page shows.
 *
 * That fix is out of scope for this file set (event-documents.ts /
 * announcements.ts are not part of this package) — tracked as a follow-up.
 * This test locks down the half of the contract THIS component owns: given
 * an already-correctly-scoped (server-filtered) documents list, the player
 * view renders the honest "nothing shared yet" empty state rather than any
 * error or misleading content, and never fabricates documents client-side —
 * so if the upstream gap above is later closed, this page keeps behaving
 * exactly as designed with no further change needed here.
 * ========================================================================== */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FairwayDocuments, type FairwayDocument } from './FairwayDocuments';

// Avoid pulling the 'use server' action import graph (supabase server
// client, next/cache) into the jsdom test — same pattern as
// FairwayJoinRequests.test.tsx / FairwayRecruitingPage.test.tsx.
vi.mock('@/app/golf/actions/documents', () => ({
  uploadGolfDocument: vi.fn(),
  createGolfDocument: vi.fn(),
  deleteGolfDocument: vi.fn(),
  updateGolfDocument: vi.fn(),
  uploadNewVersion: vi.fn(),
  getVersionHistory: vi.fn(),
  getPreviewUrl: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('@/lib/utils/capacitor', () => ({ triggerHaptic: vi.fn(async () => {}) }));

function makeDoc(over: Partial<FairwayDocument> = {}): FairwayDocument {
  return {
    id: over.id ?? 'doc-1',
    team_id: 'team-1',
    title: over.title ?? 'Team travel policy',
    description: null,
    file_url: 'https://storage.example/doc.pdf',
    file_type: 'application/pdf',
    file_size: 1024,
    category: null,
    is_public: over.is_public ?? false,
    created_at: new Date().toISOString(),
    updated_at: null,
    uploaded_by: 'coach-1',
    current_version_id: null,
    version_count: 1,
    folder: null,
    ...over,
  };
}

describe('FairwayDocuments — player view given a server-scoped documents list (#151)', () => {
  it('renders the honest "shared by coach" empty state — not an error — when the server-filtered list is empty (all seeded docs are coach-only)', () => {
    // Mirrors the seeded-account state referenced in #151: 4/4 team documents
    // are is_public=false, so the page-level `.eq('is_public', true)` filter
    // (documents/page.tsx) legitimately resolves to an empty array before
    // this component ever renders.
    render(<FairwayDocuments documents={[]} coachId="coach-1" teamId="team-1" isCoach={false} />);

    expect(screen.getByText('No documents yet')).toBeInTheDocument();
    expect(
      screen.getByText(/your team files and resources will appear here once your coach shares them/i),
    ).toBeInTheDocument();
    // Never a coach-facing upload CTA for a player.
    expect(screen.queryByRole('button', { name: /upload first document/i })).not.toBeInTheDocument();
  });

  it('never fabricates or back-fills documents client-side — renders exactly the list the server passed in, nothing more', () => {
    // Any client-side re-widening here (e.g. re-including a non-public doc)
    // would itself create a NEW parity bug in the opposite direction, so this
    // locks the component to being a pure function of its `documents` prop.
    const docs = [makeDoc({ id: 'doc-public', title: 'Spring schedule', is_public: true })];
    render(<FairwayDocuments documents={docs} coachId="coach-1" teamId="team-1" isCoach={false} />);

    expect(screen.getByText('Spring schedule')).toBeInTheDocument();
    expect(screen.getByText('1 file')).toBeInTheDocument();
    // A coach-only doc was never passed in, so it must never appear either.
    expect(screen.queryByText('Team travel policy')).not.toBeInTheDocument();
  });

  it('a player never sees coach-only management affordances even when documents are present', () => {
    const docs = [makeDoc({ id: 'doc-public', title: 'Spring schedule', is_public: true })];
    render(<FairwayDocuments documents={docs} coachId="coach-1" teamId="team-1" isCoach={false} />);

    expect(screen.queryByRole('button', { name: /^upload$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /document actions/i })).not.toBeInTheDocument();
  });
});
