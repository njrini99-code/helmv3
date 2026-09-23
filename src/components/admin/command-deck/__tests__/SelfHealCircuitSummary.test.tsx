import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SelfHealCircuitSummary } from '../SelfHealCircuitSummary';
import { buildCircuitSummary } from '@/lib/admin/command-deck/selfheal-circuit';
import { summarizeFlow } from '@/lib/admin/selfheal-flow';
import { NOW, stage } from '@/lib/admin/command-deck/__tests__/fixtures';

describe('SelfHealCircuitSummary', () => {
  // Regression: /admin scrolled 433px sideways on a 1534px viewport, measured
  // on production 2026-09-03, while /admin/errors at the same width was 0.
  //
  // A flex item defaults to `min-width: auto`, which resolves to its content's
  // MIN-CONTENT width. StageCard renders the active incident title with
  // `truncate`, and truncate's `white-space: nowrap` makes that min-content
  // width the entire untruncated title. Without min-w-0 on the wrapper the row
  // could not shrink, so truncate never engaged and the title pushed the third
  // stage off-screen. The class is the fix; asserting it is the only cheap way
  // to keep it, since jsdom does not lay out and cannot reproduce the overflow.
  it('lets each stage wrapper shrink, so a long incident title truncates instead of widening the row', () => {
    const summary = buildCircuitSummary({
      incidents: [],
      flow: summarizeFlow([], NOW),
      stageDetails: [stage('triage'), stage('repair'), stage('close')],
      verdict: { tone: 'ok', label: 'Healthy', detail: 'On schedule.' },
      now: NOW,
    });
    const { container } = render(<SelfHealCircuitSummary summary={summary} />);
    const wrappers = container.querySelectorAll('div.flex.flex-1.items-center');
    expect(wrappers.length).toBeGreaterThan(0);
    for (const w of wrappers) {
      expect(w.className).toContain('min-w-0');
    }
  });

  it('renders all three stage titles: Diagnose, Repair, Close', () => {
    const summary = buildCircuitSummary({
      incidents: [],
      flow: summarizeFlow([], NOW),
      stageDetails: [stage('triage'), stage('repair'), stage('close')],
      verdict: { tone: 'ok', label: 'Healthy', detail: 'On schedule, capability proven.' },
      now: NOW,
    });
    render(<SelfHealCircuitSummary summary={summary} />);
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
    expect(screen.getByText('Repair')).toBeInTheDocument();
    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(screen.getByText('On schedule, capability proven.')).toBeInTheDocument();
  });

  it('renders an unreadable notice, not a fabricated verdict, when the board could not be read', () => {
    const summary = buildCircuitSummary({
      incidents: [],
      flow: summarizeFlow([], NOW),
      stageDetails: null,
      verdict: null,
      now: NOW,
    });
    render(<SelfHealCircuitSummary summary={summary} />);
    expect(screen.getByText('Self-heal board could not be read this refresh.')).toBeInTheDocument();
    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0);
  });

  // Plan §2.4 — the proof-debt chip. `null` (and an omitted prop) must say
  // "unknown", never a fabricated 0: a blind or unreadable source could be
  // hiding real proof debt, so a literal zero would claim something the
  // caller could not confirm.
  it('renders the proof-debt chip as a real link to the awaiting-proof lens', () => {
    const summary = buildCircuitSummary({
      incidents: [],
      flow: summarizeFlow([], NOW),
      stageDetails: [stage('triage'), stage('repair'), stage('close')],
      verdict: { tone: 'ok', label: 'Healthy', detail: 'On schedule.' },
      now: NOW,
    });
    render(<SelfHealCircuitSummary summary={summary} proofDebt={3} />);
    const link = screen.getByRole('link', { name: /3\s*proof debt/i });
    expect(link).toHaveAttribute('href', '/admin/errors?lens=awaiting-proof');
    expect(within(link).getByText('3')).toBeInTheDocument();
  });

  it('renders "unknown" for proof debt when the caller could not compute it, never "0"', () => {
    const summary = buildCircuitSummary({
      incidents: [],
      flow: summarizeFlow([], NOW),
      stageDetails: [stage('triage'), stage('repair'), stage('close')],
      verdict: { tone: 'ok', label: 'Healthy', detail: 'On schedule.' },
      now: NOW,
    });
    render(<SelfHealCircuitSummary summary={summary} proofDebt={null} />);
    const link = screen.getByRole('link', { name: /unknown\s*proof debt/i });
    expect(within(link).queryByText('0')).not.toBeInTheDocument();
  });

  it('defaults the proof-debt chip to "unknown" when the prop is omitted', () => {
    const summary = buildCircuitSummary({
      incidents: [],
      flow: summarizeFlow([], NOW),
      stageDetails: [stage('triage'), stage('repair'), stage('close')],
      verdict: { tone: 'ok', label: 'Healthy', detail: 'On schedule.' },
      now: NOW,
    });
    render(<SelfHealCircuitSummary summary={summary} />);
    expect(screen.getByRole('link', { name: /unknown\s*proof debt/i })).toBeInTheDocument();
  });
});
