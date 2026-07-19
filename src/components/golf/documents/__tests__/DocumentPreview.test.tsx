// =============================================================================
// src/components/golf/documents/__tests__/DocumentPreview.test.tsx
//
// Regression test for the Documents page (W4 audit):
//  1. The preview modal rendered TWO overlapping close (X) buttons — its own
//     header Button PLUS the Dialog primitive's built-in Close — abandoning
//     the design system's single-close-affordance contract. Fixed by
//     removing the header's manual close button; the primitive's own Close
//     remains the only one.
//  2. Every document rendered a scary "Preview unavailable" error state when
//     it genuinely had no version content (seed/legacy data, or a
//     version-insert that silently failed at upload time) — an honest
//     emptiness, not a technical failure. getPreviewUrl now signals this via
//     `noContent: true` and the modal renders a calm, distinct empty state.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DocumentPreview } from '../DocumentPreview';
import type { GolfDocument } from '@/lib/types/golf';

const getPreviewUrlMock = vi.fn();
const getTextFileContentMock = vi.fn();

vi.mock('@/app/golf/actions/documents', () => ({
  getPreviewUrl: (...args: unknown[]) => getPreviewUrlMock(...args),
  getTextFileContent: (...args: unknown[]) => getTextFileContentMock(...args),
}));

vi.mock('@/lib/utils/capacitor', () => ({
  openExternalUrl: vi.fn(),
}));

const baseDoc: GolfDocument = {
  id: 'doc-1',
  team_id: 'team-1',
  title: 'Spring Practice Schedule',
  description: null,
  file_url: 'https://storage.example/doc.pdf',
  file_type: 'application/pdf',
  file_size: 1024,
  category: 'schedule',
  is_public: true,
  created_at: null,
  updated_at: null,
  uploaded_by: null,
  current_version_id: null,
  version_count: 1,
  folder: null,
};

describe('DocumentPreview (#w4-document-preview)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders exactly one close affordance (was: two overlapping X buttons)', async () => {
    getPreviewUrlMock.mockResolvedValue({
      data: { url: 'https://signed.example/doc.pdf', mimeType: 'application/pdf' },
      error: null,
    });

    render(<DocumentPreview golfDocument={baseDoc} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);
    });
  });

  it('shows an honest empty state (not the scary error state) when the document has no version content', async () => {
    getPreviewUrlMock.mockResolvedValue({ data: null, error: null, noContent: true });

    render(<DocumentPreview golfDocument={baseDoc} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/no preview available/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/preview unavailable/i)).not.toBeInTheDocument();
    // Still exactly one close affordance in the empty state.
    expect(screen.getAllByRole('button', { name: /close/i })).toHaveLength(1);
  });

  it('still shows the real error state (not the honest empty state) for an actual failure', async () => {
    getPreviewUrlMock.mockResolvedValue({ data: null, error: 'Not authorized to access this document' });

    render(<DocumentPreview golfDocument={baseDoc} open onOpenChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/preview unavailable/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/no preview available/i)).not.toBeInTheDocument();
  });
});
