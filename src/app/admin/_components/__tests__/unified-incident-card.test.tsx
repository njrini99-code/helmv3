import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { UnifiedIncidentCard } from '@/app/admin/_components/UnifiedIncidentCard';
import { IncidentLensRail } from '@/app/admin/_components/IncidentLensRail';
import {
  INCIDENT_LENSES,
  INCIDENT_LENS_LABEL,
  INCIDENT_LENS_DESCRIPTION,
  LIFECYCLE_LABEL,
  LIFECYCLE_TONE,
  type UnifiedIncident,
  type IncidentLensCounts,
} from '@/lib/admin/incidents/types';

// next/link's prefetch path calls `new IntersectionObserver(...)`; the
// global jsdom mock in src/test/setup.tsx is a plain vi.fn() (not
// constructor-callable), so any real next/link in a mounted tree throws.
// Swap in a plain anchor, matching triage-queue.test.tsx.
vi.mock('next/link', () => ({
  default: ({ children, href, className, ...rest }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

// ProofDots.tsx belongs to a concurrently-written file this suite does not
// own and may not exist on disk yet — mock it rather than depend on it.
vi.mock('../ProofDots', () => ({
  ProofDots: () => <span data-testid="proof-dots-stub" />,
  ProofGapList: () => null,
}));

const baseIncident: UnifiedIncident = {
  id: 'fp-1',
  linkTarget: '/admin/errors/fp-1',
  title: 'savePartialRound failed',
  description: 'savePartialRound failed',
  severity: 'error',
  lifecycle: { state: 'new', headline: 'Newly observed.', because: [] },
  firstSeen: '2026-08-20T00:00:00Z',
  lastSeen: '2026-08-27T00:00:00Z',
  occurrences: 3,
  affectedUsers: 2,
  affectedUsersKnown: true,
  sources: [
    {
      source: 'app',
      health: 'reading',
      reason: null,
      occurrences: 3,
      firstSeen: '2026-08-20T00:00:00Z',
      lastSeen: '2026-08-27T00:00:00Z',
      ref: 'fp-1',
      permalink: null,
      summary: null,
    },
  ],
  corroboration: 1,
  appFingerprints: ['fp-1'],
  sentryIssueIds: [],
  reliabilitySignatures: [],
  route: 'https://helmsportslabs.com/golf/dashboard/rounds',
  featureId: 'rounds',
  actionName: 'savePartialRound',
  errorCode: '42501',
  sport: 'golf',
  klass: 'defect',
  actionable: true,
  klassReason: 'Unexpected failure (severity-derived)',
  isFixture: false,
  analysis: null,
  repair: null,
  deployProof: null,
  resolution: null,
  proof: [],
  proofGaps: [],
  evidenceCoverage: { dimensions: [], present: 0, total: 7 },
  report: '# Incident report: savePartialRound failed',
  computedAt: '2026-08-28T00:00:00Z',
};

describe('UnifiedIncidentCard — title', () => {
  it('renders the title as incident.description, linked to linkTarget when set', () => {
    render(<UnifiedIncidentCard incident={baseIncident} series={null} />);
    const link = screen.getByRole('link', { name: 'savePartialRound failed' });
    expect(link).toHaveAttribute('href', '/admin/errors/fp-1');
  });

  it('renders the title as plain text — no anchor — when linkTarget is null', () => {
    render(<UnifiedIncidentCard incident={{ ...baseIncident, linkTarget: null }} series={null} />);
    expect(screen.getByText('savePartialRound failed')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'savePartialRound failed' })).not.toBeInTheDocument();
  });
});

describe('UnifiedIncidentCard — route path', () => {
  it('strips the origin so an absolute URL never repeats the host on every row', () => {
    // 26 identical leading characters ("https://helmsportslabs.com") on every
    // single row is exactly what routeLabel exists to stop — see
    // IncidentCard.tsx's own comment on the function this reuses.
    const { container } = render(<UnifiedIncidentCard incident={baseIncident} series={null} />);
    expect(container.textContent).not.toContain('helmsportslabs.com');
    expect(screen.getByText('/golf/dashboard/rounds')).toBeInTheDocument();
  });
});

describe('UnifiedIncidentCard — lifecycle chip', () => {
  it.each(['new', 'diagnosing', 'resolved'] as const)(
    'shows LIFECYCLE_LABEL as text for state %s',
    (state) => {
      render(
        <UnifiedIncidentCard
          incident={{ ...baseIncident, lifecycle: { state, headline: '', because: [] } }}
          series={null}
        />,
      );
      // Colour is never the only signal — the state must be legible as text,
      // not only as a tone/hue on the chip.
      expect(screen.getByText(LIFECYCLE_LABEL[state])).toBeInTheDocument();
    },
  );

  it('does NOT render `merged` with a success tone', () => {
    // Green is reserved for VERIFIED success. `merged` only means the process
    // ran (a PR landed) — not that the fault stopped — so it must map to
    // `warning`, never `success`, or "the process ran" starts reading as
    // "the system works".
    expect(LIFECYCLE_TONE.merged).toBe('warning');
    render(
      <UnifiedIncidentCard
        incident={{ ...baseIncident, lifecycle: { state: 'merged', headline: '', because: [] } }}
        series={null}
      />,
    );
    const chip = screen.getByText(LIFECYCLE_LABEL.merged);
    expect(chip.className).not.toContain('fw-success');
    expect(chip.className).toContain('fw-warning');
  });
});

describe('UnifiedIncidentCard — fixture badge (catalogued defect (h))', () => {
  it('renders a FIXTURE chip when the incident traces to a QA fixture round', () => {
    render(<UnifiedIncidentCard incident={{ ...baseIncident, isFixture: true }} series={null} />);
    expect(screen.getByText('FIXTURE')).toBeInTheDocument();
  });

  it('renders no FIXTURE chip for an ordinary incident', () => {
    render(<UnifiedIncidentCard incident={baseIncident} series={null} />);
    expect(screen.queryByText('FIXTURE')).not.toBeInTheDocument();
  });

  it('the fixture chip outranks the blind-source chip under the 5-chip cap', () => {
    // Six chips are eligible at once here (lifecycle, fixture, corroboration,
    // RCA, PR, blind source) — one more than the cap, so this also pins which
    // one loses: a fixture is a fact about the DATA, and outranks a source
    // read failure for an operator's attention.
    const loaded: UnifiedIncident = {
      ...baseIncident,
      isFixture: true,
      corroboration: 3,
      analysis: {
        category: 'fix-here',
        probableCause: 'x',
        suggestedFix: 'y',
        confidence: 'high',
        suspectFiles: [],
        relatedFingerprints: [],
        model: 'test-model',
        generatedAt: '2026-08-27T00:00:00Z',
        repairVerdict: 'not-reviewed',
      },
      repair: {
        status: 'pr-open',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
        branch: 'agent/fix',
        checks: null,
        mergedAt: null,
        mergeSha: null,
        note: null,
      },
      sources: [
        ...baseIncident.sources,
        {
          source: 'sentry',
          health: 'blind',
          reason: 'Sentry API timed out',
          occurrences: null,
          firstSeen: null,
          lastSeen: null,
          ref: null,
          permalink: null,
          summary: null,
        },
      ],
    };
    render(<UnifiedIncidentCard incident={loaded} series={null} />);
    expect(screen.getAllByTestId('unified-incident-chip')).toHaveLength(5);
    expect(screen.getByText('FIXTURE')).toBeInTheDocument();
    expect(screen.queryByText('SOURCE BLIND')).not.toBeInTheDocument();
  });
});

describe('UnifiedIncidentCard — chip cap', () => {
  it('renders at most 5 state chips even when every trigger fires at once', () => {
    // Twelve badges is confetti, not hierarchy — the previous incident card
    // proved it (Row.tsx's own header). This incident fires every chip this
    // card knows how to render: lifecycle, corroboration (>=2), RCA
    // (analysis present), PR (repair.prNumber set), and a blind source.
    const loaded: UnifiedIncident = {
      ...baseIncident,
      corroboration: 3,
      analysis: {
        category: 'fix-here',
        probableCause: 'x',
        suggestedFix: 'y',
        confidence: 'high',
        suspectFiles: [],
        relatedFingerprints: [],
        model: 'test-model',
        generatedAt: '2026-08-27T00:00:00Z',
        repairVerdict: 'not-reviewed',
      },
      repair: {
        status: 'pr-open',
        prNumber: 42,
        prUrl: 'https://github.com/org/repo/pull/42',
        branch: 'agent/fix',
        checks: null,
        mergedAt: null,
        mergeSha: null,
        note: null,
      },
      sources: [
        ...baseIncident.sources,
        {
          source: 'sentry',
          health: 'blind',
          reason: 'Sentry API timed out',
          occurrences: null,
          firstSeen: null,
          lastSeen: null,
          ref: null,
          permalink: null,
          summary: null,
        },
      ],
    };
    render(<UnifiedIncidentCard incident={loaded} series={null} />);
    expect(screen.getAllByTestId('unified-incident-chip')).toHaveLength(5);
  });
});

describe('UnifiedIncidentCard — proof gap', () => {
  it("renders the first proof gap's detail verbatim, never truncated to its category label", () => {
    render(
      <UnifiedIncidentCard
        incident={{
          ...baseIncident,
          proofGaps: [
            { kind: 'awaiting-traffic', detail: 'iOS calls since deploy: 4', ageMs: 3_600_000 },
            { kind: 'awaiting-ci', detail: 'CI has not run since the last push', ageMs: null },
          ],
        }}
        series={null}
      />,
    );
    expect(screen.getByText('iOS calls since deploy: 4')).toBeInTheDocument();
    // Only the FIRST gap renders — a card is not the place for the full list.
    expect(screen.queryByText('CI has not run since the last push')).not.toBeInTheDocument();
  });
});

describe('UnifiedIncidentCard — affected users', () => {
  it('renders "unknown user" for affectedUsersKnown: false with affectedUsers: 0, never "0 users"', () => {
    render(
      <UnifiedIncidentCard
        incident={{ ...baseIncident, affectedUsers: 0, affectedUsersKnown: false }}
        series={null}
      />,
    );
    expect(screen.getByText(/unknown user/)).toBeInTheDocument();
    expect(screen.queryByText(/0 users?/)).not.toBeInTheDocument();
  });
});

const lensCounts: IncidentLensCounts = {
  actionable: 4,
  reliability: 2,
  repairable: 1,
  'needs-evidence': 0,
  regressions: 0,
  'expected-recurrence': 0,
  stalled: 0,
  'awaiting-proof': 3,
  all: 9,
};

describe('IncidentLensRail', () => {
  it('renders one link per INCIDENT_LENSES member', () => {
    render(<IncidentLensRail active="actionable" counts={lensCounts} hrefFor={(l) => `/admin/incidents?lens=${l}`} />);
    for (const lens of INCIDENT_LENSES) {
      const link = screen.getByRole('link', { name: new RegExp(INCIDENT_LENS_LABEL[lens]) });
      expect(link).toHaveAttribute('href', `/admin/incidents?lens=${lens}`);
    }
    expect(screen.getAllByRole('link')).toHaveLength(INCIDENT_LENSES.length);
  });

  it('marks the active lens with aria-current="page" and renders its description', () => {
    render(<IncidentLensRail active="repairable" counts={lensCounts} hrefFor={(l) => `/admin/incidents?lens=${l}`} />);
    const active = screen.getByRole('link', { name: new RegExp(INCIDENT_LENS_LABEL.repairable) });
    expect(active).toHaveAttribute('aria-current', 'page');
    const others = screen.getAllByRole('link').filter((l) => l !== active);
    for (const other of others) {
      expect(other).not.toHaveAttribute('aria-current');
    }
    expect(screen.getByText(INCIDENT_LENS_DESCRIPTION.repairable)).toBeInTheDocument();
  });

  it('renders a zero-count lens rather than hiding it', () => {
    render(<IncidentLensRail active="actionable" counts={lensCounts} hrefFor={(l) => `/admin/incidents?lens=${l}`} />);
    // 'needs-evidence' and 'regressions' both carry a 0 count in this fixture
    // — a lens that disappears when empty makes the full set unlearnable.
    const needsEvidence = screen.getByRole('link', { name: new RegExp(INCIDENT_LENS_LABEL['needs-evidence']) });
    expect(needsEvidence).toBeInTheDocument();
    expect(needsEvidence).toHaveTextContent('0');
  });
});

// ---------------------------------------------------------------------------
// 2026-09-01 — the feature tag, the lifecycle headline, and the details
// disclosure: the three things an operator asked the row to say out loud.
// ---------------------------------------------------------------------------

describe('UnifiedIncidentCard — feature tag', () => {
  it('renders the registry LABEL for a known feature key, not the key', () => {
    render(<UnifiedIncidentCard incident={{ ...baseIncident, featureId: 'round_tracking' }} series={null} />);
    const tags = screen.getByTestId('unified-incident-tags');
    expect(tags).toHaveTextContent('Feature');
    expect(tags).toHaveTextContent('Round Tracking');
    expect(tags).not.toHaveTextContent('round_tracking');
  });

  it('says "untagged" out loud when the error was logged without a feature', () => {
    render(<UnifiedIncidentCard incident={{ ...baseIncident, featureId: null }} series={null} />);
    expect(screen.getByTestId('unified-incident-tags')).toHaveTextContent('untagged');
  });

  it('renders an unregistered key as itself, never laundered into a label', () => {
    render(<UnifiedIncidentCard incident={{ ...baseIncident, featureId: 'not_in_registry' }} series={null} />);
    expect(screen.getByTestId('unified-incident-tags')).toHaveTextContent('not_in_registry');
  });

  it('names the sport in words', () => {
    render(<UnifiedIncidentCard incident={{ ...baseIncident, sport: 'baseball' }} series={null} />);
    expect(screen.getByTestId('unified-incident-tags')).toHaveTextContent('Baseball');
  });
});

describe('UnifiedIncidentCard — lifecycle headline and details', () => {
  it('renders the lifecycle headline sentence on the row', () => {
    render(
      <UnifiedIncidentCard
        incident={{
          ...baseIncident,
          lifecycle: { state: 'diagnosing', headline: 'Seen recently — Diagnose has not had a chance to analyse it yet.', because: [] },
        }}
        series={null}
      />,
    );
    expect(screen.getByText('Seen recently — Diagnose has not had a chance to analyse it yet.')).toBeInTheDocument();
  });

  it('carries the error code hint, every source with its health, and the lifecycle checks in the details disclosure', () => {
    render(
      <UnifiedIncidentCard
        incident={{
          ...baseIncident,
          errorCode: '42501',
          lifecycle: {
            state: 'new',
            headline: 'New — not yet analysed.',
            because: [
              { status: 'pending', text: 'First seen 3 days ago.' },
              { status: 'failed', text: 'A source could not be read.' },
            ],
          },
        }}
        series={null}
      />,
    );
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText(/permission denied/)).toBeInTheDocument();
    // Each source carries its health word beside its name in the disclosure.
    expect(screen.getByText('(reading)')).toBeInTheDocument();
    expect(screen.getByText('First seen 3 days ago.')).toBeInTheDocument();
    expect(screen.getByText('A source could not be read.')).toBeInTheDocument();
    // The status WORD travels with each check — colour is never the only channel.
    expect(screen.getByText('failed')).toBeInTheDocument();
  });
});
