import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RcaPanel } from '@/app/admin/errors/_components/RcaPanel';
import type { RcaAnalysis } from '@/lib/admin/rca';

const okAnalysis: RcaAnalysis = {
  probableCause: 'Null pointer in the save path',
  suspectFiles: [{ path: 'src/lib/golf/foo.ts', line: 42, reason: 'named in the stack trace' }],
  suggestedFix: 'Guard the null case',
  confidence: 'high',
  relatedFingerprints: [],
  model: 'anthropic/claude-sonnet-5',
  generatedAt: '2026-08-25T10:05:00.000Z',
};

describe('RcaPanel', () => {
  it('shows the empty state and the analyze button when no analysis exists yet', () => {
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={null} onAnalyze={vi.fn()} />);
    expect(screen.getByText(/no analysis yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze with Claude' })).toBeInTheDocument();
  });

  it('renders a stored analysis without calling the action', () => {
    const onAnalyze = vi.fn();
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={okAnalysis} onAnalyze={onAnalyze} />);
    expect(screen.getByText('Null pointer in the save path')).toBeInTheDocument();
    expect(screen.getByText('Guard the null case')).toBeInTheDocument();
    expect(screen.getByText('high confidence')).toBeInTheDocument();
    expect(screen.getByText('src/lib/golf/foo.ts:42')).toBeInTheDocument();
    expect(onAnalyze).not.toHaveBeenCalled();
  });

  it('does not render a suspect-files section when the analysis found none', () => {
    render(
      <RcaPanel
        fingerprint="fp-1"
        initialAnalysis={{ ...okAnalysis, suspectFiles: [] }}
        onAnalyze={vi.fn()}
      />,
    );
    expect(screen.queryByText('Suspect files')).not.toBeInTheDocument();
  });

  it('clicking Analyze with Claude calls the action and replaces the displayed analysis on success', async () => {
    const fresh: RcaAnalysis = { ...okAnalysis, probableCause: 'Fresh cause', generatedAt: '2026-08-25T11:00:00.000Z' };
    const onAnalyze = vi.fn().mockResolvedValue({ status: 'ok', analysis: fresh });
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={null} onAnalyze={onAnalyze} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze with Claude' }));
    expect(onAnalyze).toHaveBeenCalledWith('fp-1');
    await waitFor(() => expect(screen.getByText('Fresh cause')).toBeInTheDocument());
  });

  it('renders an unconfigured result as an inline notice naming the env var, without discarding an existing analysis', async () => {
    const onAnalyze = vi.fn().mockResolvedValue({
      status: 'unconfigured',
      message: 'Root-cause analysis needs ANTHROPIC_API_KEY configured — set it and retry.',
    });
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={okAnalysis} onAnalyze={onAnalyze} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze with Claude' }));
    await waitFor(() =>
      expect(screen.getByText(/ANTHROPIC_API_KEY configured/)).toBeInTheDocument(),
    );
    // The prior stored analysis is still on screen — an unconfigured retry
    // must not blank out what was already there.
    expect(screen.getByText('Null pointer in the save path')).toBeInTheDocument();
  });

  it('surfaces a model-error result inline', async () => {
    const onAnalyze = vi.fn().mockResolvedValue({ status: 'error', message: 'model unavailable' });
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={null} onAnalyze={onAnalyze} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze with Claude' }));
    await waitFor(() => expect(screen.getByText('model unavailable')).toBeInTheDocument());
  });

  // The category chip. `suggestedFix` is free text written by an agent
  // routine, so the panel derives the verdict from it rather than trusting a
  // stored field — and an opening it cannot classify has to LOOK
  // unclassified, because no automatic path will act on it.
  it.each([
    ['FIX HERE — add the missing code at golf.ts:1770.', 'Fix here'],
    ['ALREADY FIXED — commit 3b4204e is an ancestor of the serving SHA.', 'Already fixed'],
    ['NOT A DEFECT — expected client-side fetch cancellation.', 'Not a defect'],
    ['NEEDS MORE EVIDENCE — no stack trace was captured.', 'Needs evidence'],
  ])('renders the category chip for %s', (suggestedFix, label) => {
    render(
      <RcaPanel fingerprint="fp-1" initialAnalysis={{ ...okAnalysis, suggestedFix }} onAnalyze={vi.fn()} />,
    );
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders an off-contract suggestedFix as Uncategorized rather than silently omitting the chip', () => {
    // A real production analysis from 2026-08-27. The old SQL handoff
    // (`suggestedFix ilike 'FIX HERE%'`) matched none of these and dropped
    // them; showing a blank space here would reproduce that invisibility.
    render(
      <RcaPanel
        fingerprint="fp-1"
        initialAnalysis={{ ...okAnalysis, suggestedFix: 'No fix needed - single occurrence, known noise class.' }}
        onAnalyze={vi.fn()}
      />,
    );
    expect(screen.getByText('Uncategorized')).toBeInTheDocument();
  });

  it('updates the category chip when a fresh analysis replaces the stored one', async () => {
    // A single render cannot see this: the chip is derived from component
    // STATE, and `initialAnalysis` only seeds it. The case that matters is
    // the state changing under a re-analysis — which is the path an operator
    // actually takes when they press the button on a stale verdict.
    const fresh: RcaAnalysis = { ...okAnalysis, suggestedFix: 'ALREADY FIXED — shipped in 3b4204e.' };
    const onAnalyze = vi.fn().mockResolvedValue({ status: 'ok', analysis: fresh });
    render(
      <RcaPanel
        fingerprint="fp-1"
        initialAnalysis={{ ...okAnalysis, suggestedFix: 'FIX HERE — guard the null case.' }}
        onAnalyze={onAnalyze}
      />,
    );
    expect(screen.getByText('Fix here')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze with Claude' }));
    await waitFor(() => expect(screen.getByText('Already fixed')).toBeInTheDocument());
    expect(screen.queryByText('Fix here')).not.toBeInTheDocument();
  });

  it('shows a not-permitted message rather than throwing when the action rejects', async () => {
    const onAnalyze = vi.fn().mockRejectedValue(new Error('Forbidden'));
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={null} onAnalyze={onAnalyze} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze with Claude' }));
    await waitFor(() => expect(screen.getByText(/not permitted/i)).toBeInTheDocument());
  });
});
