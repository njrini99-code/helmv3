import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SelfHealCircuitSummary } from '../SelfHealCircuitSummary';
import { buildCircuitSummary } from '@/lib/admin/command-deck/selfheal-circuit';
import { summarizeFlow } from '@/lib/admin/selfheal-flow';
import { NOW, stage } from '@/lib/admin/command-deck/__tests__/fixtures';

describe('SelfHealCircuitSummary', () => {
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
});
