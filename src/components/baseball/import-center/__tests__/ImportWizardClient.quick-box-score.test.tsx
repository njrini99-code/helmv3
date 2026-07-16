// =============================================================================
// ImportWizardClient — "Quick box score" + drag-and-drop + data preview.
//
// WIZARD CONSOLIDATION (stats/upload -> Import Center): the legacy
// StatsUploadClient wizard offered two things Import Center's flow did not —
// (1) a drag-and-drop dropzone (click-to-browse only, before this change) and
// (2) a visible preview of the CSV's actual sample values before the coach
// commits to a column mapping. Both are ported here as first-class parts of
// the SAME canonical pipeline (no parallel write path, no capability lost).
// This spec pins that port so it can't silently regress.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import type { ImportPreview } from '@/app/baseball/actions/imports';
import type { BaseballImportRowMatch } from '@/lib/types/baseball-imports';

const mocks = vi.hoisted(() => ({
  previewImport: vi.fn(),
  commitImport: vi.fn(),
  rollbackImport: vi.fn(),
  reviewImportRun: vi.fn(),
  getImportRunFileUrl: vi.fn(),
}));

vi.mock('@/app/baseball/actions/imports', () => ({
  previewImport: mocks.previewImport,
  commitImport: mocks.commitImport,
  rollbackImport: mocks.rollbackImport,
  reviewImportRun: mocks.reviewImportRun,
  getImportRunFileUrl: mocks.getImportRunFileUrl,
}));

import { ImportWizardClient } from '../ImportWizardClient';

const PLAYERS = [
  { id: 'p1', first_name: 'Jane', last_name: 'Doe', jersey_number: 12, grad_year: 2027, primary_position: 'SS' },
];

function makePreview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  const matches: BaseballImportRowMatch[] = [
    {
      rowIndex: 0,
      sourceName: 'Jane Doe',
      playerId: 'p1',
      playerName: 'Jane Doe',
      confidence: 1,
      matchTier: 'exact_roster',
      isManualMatch: false,
      action: 'update',
    },
  ];
  return {
    sourceId: 'generic_csv',
    sourceLabel: 'Generic CSV',
    detectedSourceId: 'generic_csv',
    headers: ['player', 'ab', 'h'],
    mapping: { player_name: 'player', at_bats: 'ab', hits: 'h' },
    matches,
    totalRows: 1,
    matchedRows: 1,
    unmatchedRows: 0,
    rows: [{ player: 'Jane Doe', ab: '4', h: '2' }],
    validation: {
      issues: [],
      blockingCount: 0,
      warningCount: 0,
      infoCount: 0,
      blockingRowIndices: [],
      hasBlockers: false,
      hasWarnings: false,
    },
    policy: {
      registered: false,
      trustLevel: 'unreviewed',
      defaultVisibility: 'staff_only',
      requiredReview: false,
      dedupeStrictness: 'standard',
      playerMatchStrategy: 'name_then_external_id',
      externalIdNamespace: null,
    },
    duplicates: [],
    ...overrides,
  };
}

function makeCsvFile(name = 'sample.csv'): File {
  const csv = 'player,ab,h\nJane Doe,4,2\n';
  return new File([csv], name, { type: 'text/csv' });
}

describe('ImportWizardClient — Quick box score entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('jumps straight to the Upload step with the box-score shape preselected, skipping the choose ceremony', () => {
    render(
      <ImportWizardClient teamId="team-1" teamName="Rini U" players={PLAYERS} recentRuns={[]} />
    );

    expect(screen.getByText('Quick box score')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Quick box score'));

    // The upload step's context strip stamps the active data shape (it renders
    // twice — the shape badge plus the data-shape summary further down — so
    // assert at least one is present rather than pinning an exact count).
    expect(screen.getAllByText('Game box score').length).toBeGreaterThan(0);
    expect(screen.getByText(/Choose a CSV or Excel file|Drop it in/)).toBeInTheDocument();
  });

  it('accepts a dropped file on the dropzone (not just click-to-browse)', async () => {
    render(
      <ImportWizardClient teamId="team-1" teamName="Rini U" players={PLAYERS} recentRuns={[]} />
    );
    fireEvent.click(screen.getByText('Quick box score'));

    const dropzone = screen.getByText(/Choose a CSV or Excel file/).closest('label');
    expect(dropzone).not.toBeNull();

    const file = makeCsvFile();
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('sample.csv')).toBeInTheDocument();
    });

    // Dropping a file enables the same "Analyze file" action the click-to-
    // browse path uses — one canonical pipeline, not a shortcut around it.
    const analyzeButton = screen.getByRole('button', { name: 'Analyze file' });
    expect(analyzeButton).not.toBeDisabled();
  });

  it('shows a sample-values data preview before the coach commits to a column mapping', async () => {
    mocks.previewImport.mockResolvedValue(makePreview());

    render(
      <ImportWizardClient teamId="team-1" teamName="Rini U" players={PLAYERS} recentRuns={[]} />
    );
    fireEvent.click(screen.getByText('Quick box score'));

    const dropzone = screen.getByText(/Choose a CSV or Excel file/).closest('label');
    fireEvent.drop(dropzone!, { dataTransfer: { files: [makeCsvFile()] } });
    await waitFor(() => screen.getByText('sample.csv'));

    fireEvent.click(screen.getByRole('button', { name: 'Analyze file' }));

    await waitFor(() => {
      expect(mocks.previewImport).toHaveBeenCalled();
    });

    // The actual row values from the parsed file are visible, not just the
    // header names — this is what the legacy wizard's "Data Preview" table
    // gave a coach that Import Center's detect step didn't show before.
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });
});
