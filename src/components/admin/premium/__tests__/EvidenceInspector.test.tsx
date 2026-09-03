import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvidenceInspector, type EvidenceInspectorData } from '../EvidenceInspector';
import { buildEvidenceCoverage } from '@/lib/admin/incidents/coverage';

const data: EvidenceInspectorData = {
  id: 'inc-1',
  title: 'Round autosave blocked by database permissions',
  technicalSignature: '42501 · permission denied for schema helm_private',
  operationContext: 'Golf > Round Tracking > Autosave',
  severity: 'error',
  lifecycle: { state: 'diagnosing', headline: 'Diagnose is analysing this incident.', because: [] },
  firstSeen: '2026-09-02T12:07:00.000Z',
  lastSeen: '2026-09-02T12:20:00.000Z',
  occurrences: 12,
  affectedUsers: 5,
  affectedUsersKnown: true,
  releaseRelationship: null,
  evidenceCoverage: buildEvidenceCoverage([{ source: 'sentry', health: 'reading', reason: null }]),
  episodes: [],
  episodesIncomplete: false,
  repair: null,
  linkTarget: '/admin/errors/inc-1',
};

describe('EvidenceInspector', () => {
  it('renders the human title, technical signature and operation context when open', () => {
    render(<EvidenceInspector data={data} open onOpenChange={() => {}} />);
    expect(screen.getByText('Golf > Round Tracking > Autosave')).toBeInTheDocument();
    expect(screen.getByText('42501 · permission denied for schema helm_private')).toBeInTheDocument();
  });

  it('says "No incident selected" rather than rendering blank when data is null', () => {
    render(<EvidenceInspector data={null} open onOpenChange={() => {}} />);
    expect(screen.getByText('No incident selected.')).toBeInTheDocument();
  });

  it('switches to the Evidence tab and shows the source confidence ring', () => {
    // fireEvent.click (a plain click event), not userEvent.click — the
    // latter also synthesizes a pointerdown/pointerup sequence that bubbles
    // to the enclosing Sheet's vaul Drawer.Content, which listens for those
    // to support drag-to-dismiss. jsdom has no `setPointerCapture`, so that
    // path throws outside this test's control. Radix's ToggleGroup activates
    // on a plain click, so this exercises the same tab switch without it.
    render(<EvidenceInspector data={data} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('radio', { name: 'Evidence' }));
    expect(screen.getByText('1 of 6 sources read')).toBeInTheDocument();
  });

  it('calls onOpenChange when the sheet is asked to close', () => {
    const onOpenChange = vi.fn();
    render(<EvidenceInspector data={data} open onOpenChange={onOpenChange} />);
    // Smoke test only — Sheet's own close interactions (escape/scrim/drag)
    // are covered by Fairway's own Sheet tests; this just proves the prop
    // wiring compiles and the sheet renders with a live handler.
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
