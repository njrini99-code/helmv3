// =============================================================================
// AttentionQueue — the panel that must not read as "nothing to do" when it is
// really "we could not finish checking". The load-bearing behaviour: an empty
// list under a blind source renders an honest partial state, not the same
// quiet all-clear a genuinely clean board gets. Everything else here pins the
// row contract — the why renders verbatim, the state word is always text (not
// colour alone), and overflow is linked rather than silently dropped.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AttentionQueue } from '@/app/admin/_components/AttentionQueue';
import type { AttentionRow } from '@/lib/admin/incidents/attention';

function attentionRow(overrides: Partial<AttentionRow> = {}): AttentionRow {
  return {
    key: 'a',
    reason: 'needs-evidence',
    state: 'NEEDS EVIDENCE',
    headline: 'Something needs a look',
    why: 'Analysis says it needs more evidence before it can proceed.',
    ageMs: 60_000,
    href: '/admin/errors/a',
    tone: 'warning',
    ...overrides,
  };
}

const checkedAt = '2026-08-28T12:00:00.000Z';

describe('AttentionQueue — empty states', () => {
  it('renders a quiet all-clear when empty and canClaimAllClear', () => {
    render(<AttentionQueue rows={[]} total={0} checkedAt={checkedAt} canClaimAllClear />);
    expect(screen.getByText(/needs your eyes — nothing right now/i)).toBeInTheDocument();
  });

  it('does NOT render an all-clear when empty and a source could not be read, and says so', () => {
    // The guard. An empty queue we could not fully compute must never render
    // as a calm morning.
    render(<AttentionQueue rows={[]} total={0} checkedAt={checkedAt} canClaimAllClear={false} />);
    expect(screen.queryByText(/nothing right now/i)).not.toBeInTheDocument();
    expect(screen.getByText(/could not be read/i)).toBeInTheDocument();
  });
});

describe('AttentionQueue — row rendering', () => {
  it('renders the why verbatim, never shortened to the category', () => {
    render(
      <AttentionQueue
        rows={[attentionRow({ why: 'Fixed 6 days ago, returned 14 minutes ago.' })]}
        total={1}
        checkedAt={checkedAt}
        canClaimAllClear={false}
      />,
    );
    expect(screen.getByText('Fixed 6 days ago, returned 14 minutes ago.')).toBeInTheDocument();
  });

  it('renders the headline as a link when href is set', () => {
    render(
      <AttentionQueue
        rows={[attentionRow({ headline: 'incident xyz', href: '/admin/errors/xyz' })]}
        total={1}
        checkedAt={checkedAt}
        canClaimAllClear={false}
      />,
    );
    const link = screen.getByRole('link', { name: 'incident xyz' });
    expect(link).toHaveAttribute('href', '/admin/errors/xyz');
  });

  it('renders the headline as plain text, not a link, when href is null', () => {
    render(
      <AttentionQueue
        rows={[attentionRow({ headline: 'Stage dead', href: null })]}
        total={1}
        checkedAt={checkedAt}
        canClaimAllClear={false}
      />,
    );
    expect(screen.getByText('Stage dead')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Stage dead' })).not.toBeInTheDocument();
  });

  it('renders the state word as text for at least three different tones — colour is never the only signal', () => {
    render(
      <AttentionQueue
        rows={[
          attentionRow({ key: 'a', state: 'REGRESSED', tone: 'danger' }),
          attentionRow({ key: 'b', state: 'NEEDS EVIDENCE', tone: 'warning' }),
          attentionRow({ key: 'c', state: 'REPAIRABLE', tone: 'accent' }),
        ]}
        total={3}
        checkedAt={checkedAt}
        canClaimAllClear={false}
      />,
    );
    expect(screen.getByText('REGRESSED')).toBeInTheDocument();
    expect(screen.getByText('NEEDS EVIDENCE')).toBeInTheDocument();
    expect(screen.getByText('REPAIRABLE')).toBeInTheDocument();
  });

  it('omits the age when ageMs is null rather than fabricating one', () => {
    render(
      <AttentionQueue
        rows={[attentionRow({ ageMs: null })]}
        total={1}
        checkedAt={checkedAt}
        canClaimAllClear={false}
      />,
    );
    expect(screen.queryByText(/ago/i)).not.toBeInTheDocument();
  });
});

describe('AttentionQueue — overflow', () => {
  it('shows no overflow link when total equals the shown rows', () => {
    render(
      <AttentionQueue rows={[attentionRow()]} total={1} checkedAt={checkedAt} canClaimAllClear={false} />,
    );
    expect(screen.queryByRole('link', { name: /more needing attention/i })).not.toBeInTheDocument();
  });

  it('links overflow to /admin/errors, honestly counting what was dropped', () => {
    render(
      <AttentionQueue rows={[attentionRow()]} total={4} checkedAt={checkedAt} canClaimAllClear={false} />,
    );
    const link = screen.getByRole('link', { name: /3 more needing attention/i });
    expect(link).toHaveAttribute('href', '/admin/errors');
  });
});
