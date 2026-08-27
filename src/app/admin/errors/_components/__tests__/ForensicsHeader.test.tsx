import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ForensicsHeader } from '@/app/admin/errors/_components/ForensicsHeader';
import type { FingerprintForensics } from '@/lib/admin/data/errors';

const baseForensics: FingerprintForensics = {
  severity: 'error',
  classification: { klass: 'defect', actionable: true, reason: 'Unexpected failure (severity-derived)', hasDegradedMessage: false },
  errorCode: null,
  errorHint: null,
  requestId: null,
  helmTraceId: null,
  runtime: null,
  handled: null,
  source: 'server_action',
  feature: 'round_tracking',
  sport: 'golf',
  actionName: 'submitGolfRoundComprehensive',
  sourceFilePath: 'src/app/golf/actions/golf.ts',
  suspectDeploy: null,
  hasUnknownAffectedUsers: false,
  storedRca: null,
};

describe('ForensicsHeader', () => {
  it('renders severity and classification as badges', () => {
    render(<ForensicsHeader forensics={baseForensics} />);
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('Defect')).toBeInTheDocument();
  });

  it('renders every populated field with its value', () => {
    render(<ForensicsHeader forensics={baseForensics} />);
    expect(screen.getByText('src/app/golf/actions/golf.ts')).toBeInTheDocument();
    expect(screen.getByText('golf')).toBeInTheDocument();
    expect(screen.getByText('Round Tracking (round_tracking)')).toBeInTheDocument();
    expect(screen.getByText('server_action')).toBeInTheDocument();
    expect(screen.getByText('submitGolfRoundComprehensive')).toBeInTheDocument();
  });

  it('names every absent field once instead of rendering six empty boxes', () => {
    // The contract is unchanged — absence is STATED, never invented or
    // silently hidden. What changed is where: absent fields used to each
    // render their own bordered box containing an em-dash, which on a phone
    // (one column) meant a client incident showed six empty boxes above the
    // two fields that actually had values. They are now named once, together.
    render(<ForensicsHeader forensics={baseForensics} />);

    // No em-dash boxes remain...
    expect(screen.queryAllByText('—')).toHaveLength(0);

    // ...and every one of the six is still accounted for, by name.
    const notCaptured = screen.getByText(/not captured/i).parentElement;
    expect(notCaptured).not.toBeNull();
    for (const label of ['error code', 'error hint', 'request id', 'trace id', 'runtime', 'handled']) {
      expect(notCaptured!.textContent).toContain(label);
    }
    // Absence is explained, so a blank field never reads as a broken panel.
    expect(notCaptured!.textContent).toMatch(/absent on this incident, not hidden/i);
  });

  it('does not render an "Open flight trace" link when helmTraceId is absent', () => {
    render(<ForensicsHeader forensics={baseForensics} />);
    expect(screen.queryByRole('link', { name: /open flight trace/i })).not.toBeInTheDocument();
  });

  it('renders the flight-trace link when helmTraceId is present, pointing at the tracer with the trace id', () => {
    render(<ForensicsHeader forensics={{ ...baseForensics, helmTraceId: 'trace-xyz789' }} />);
    const link = screen.getByRole('link', { name: /open flight trace/i });
    expect(link).toHaveAttribute('href', '/admin/golf/tracer?trace=trace-xyz789');
  });

  it('renders handled as words, not a raw boolean', () => {
    render(<ForensicsHeader forensics={{ ...baseForensics, handled: true }} />);
    expect(screen.getByText('yes')).toBeInTheDocument();

    render(<ForensicsHeader forensics={{ ...baseForensics, handled: false }} />);
    expect(screen.getByText('no — unhandled')).toBeInTheDocument();
  });

  it('renders the error code with its hint as independently copyable fields', () => {
    render(
      <ForensicsHeader
        forensics={{ ...baseForensics, errorCode: '23505', errorHint: 'duplicate key value violates unique constraint' }}
      />,
    );
    expect(screen.getByText('23505')).toBeInTheDocument();
    expect(screen.getByText('duplicate key value violates unique constraint')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Error code' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy Error hint' })).toBeInTheDocument();
  });
});
