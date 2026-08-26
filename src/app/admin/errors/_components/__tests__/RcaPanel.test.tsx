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

  it('shows a not-permitted message rather than throwing when the action rejects', async () => {
    const onAnalyze = vi.fn().mockRejectedValue(new Error('Forbidden'));
    render(<RcaPanel fingerprint="fp-1" initialAnalysis={null} onAnalyze={onAnalyze} />);

    fireEvent.click(screen.getByRole('button', { name: 'Analyze with Claude' }));
    await waitFor(() => expect(screen.getByText(/not permitted/i)).toBeInTheDocument());
  });
});
