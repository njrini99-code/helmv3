import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReleaseWakeRibbon } from '../ReleaseWakeRibbon';
import { buildReleaseWake } from '@/lib/admin/command-deck/release-wake';

const NOW = Date.parse('2026-09-03T12:00:00.000Z');
const DEPLOY_AT = Date.parse('2026-09-03T08:00:00.000Z');

describe('ReleaseWakeRibbon', () => {
  it('renders the short SHA and watch-state label', () => {
    const wake = buildReleaseWake({
      incidents: [],
      releaseSha: '8e4c5b7d1234567890',
      deployedAtMs: DEPLOY_AT,
      sourceCoverageBlind: false,
      now: NOW,
      selfHealActionsSinceDeploy: 0,
    });
    render(<ReleaseWakeRibbon wake={wake} />);
    expect(screen.getByText('8e4c5b7')).toBeInTheDocument();
    // 4h past deploy, no incidents: past the 1h OBSERVING window but short of
    // the 24h PROVEN HEALTHY window, so the honest verdict is CLEAN SO FAR.
    expect(screen.getByText('CLEAN SO FAR')).toBeInTheDocument();
  });

  // `quiet` is passed only under a granted page-level all-clear.
  describe('quiet', () => {
    function calmWake(selfHealActionsSinceDeploy = 0) {
      return buildReleaseWake({
        incidents: [],
        releaseSha: '8e4c5b7d1234567890',
        deployedAtMs: DEPLOY_AT,
        sourceCoverageBlind: false,
        now: NOW,
        selfHealActionsSinceDeploy,
      });
    }

    it('says "nothing new" once instead of four zero tiles, and still names the unmeasured lanes', () => {
      render(<ReleaseWakeRibbon wake={calmWake()} quiet />);
      expect(screen.getByText(/Nothing new since this release/)).toBeInTheDocument();
      expect(screen.queryAllByText('0')).toHaveLength(0);
      // Never dropped: the lanes with no read model are still stated, as unknown.
      expect(screen.getByText('latency')).toHaveAttribute('data-slot', 'bridge-unknown-inline');
      expect(screen.getByText('invariants')).toHaveAttribute('data-slot', 'bridge-unknown-inline');
      expect(screen.getByText('8e4c5b7')).toBeInTheDocument();
      expect(screen.getByText('CLEAN SO FAR')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Release Runway →' })).toHaveAttribute('href', '/admin/deploys');
    });

    it('renders the full lanes as soon as any measured lane is non-zero', () => {
      render(<ReleaseWakeRibbon wake={calmWake(2)} quiet />);
      expect(screen.queryByText(/Nothing new since this release/)).not.toBeInTheDocument();
      expect(screen.getByText('Self-heal')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders the full lanes when the deploy time is unknown, so every lane is unread', () => {
      const wake = buildReleaseWake({
        incidents: [],
        releaseSha: null,
        deployedAtMs: null,
        sourceCoverageBlind: false,
        now: NOW,
        selfHealActionsSinceDeploy: 0,
      });
      render(<ReleaseWakeRibbon wake={wake} quiet />);
      expect(screen.queryByText(/Nothing new since this release/)).not.toBeInTheDocument();
      expect(screen.getByText('Incidents')).toBeInTheDocument();
    });

    it('is off by default: a calm wake still renders every lane', () => {
      render(<ReleaseWakeRibbon wake={calmWake()} />);
      expect(screen.queryByText(/Nothing new since this release/)).not.toBeInTheDocument();
      expect(screen.getByText('Incidents')).toBeInTheDocument();
    });
  });

  it('renders latency and invariants lanes as honestly unknown, never a zero', () => {
    const wake = buildReleaseWake({
      incidents: [],
      releaseSha: null,
      deployedAtMs: null,
      sourceCoverageBlind: false,
      now: NOW,
      selfHealActionsSinceDeploy: 0,
    });
    render(<ReleaseWakeRibbon wake={wake} />);
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument();
    // Every lane is unknown here (deploy time unknown), so every count cell
    // renders the em dash, never a bare "0" a reader could mistake for clean.
    expect(screen.queryAllByText('0')).toHaveLength(0);
  });
});
