/**
 * DomainAuthCard — regression test.
 *
 * The Deliverability tab's SPF/DKIM/DMARC check must fire unconditionally
 * (independent of Gmail direct-send being configured) since Resend sending
 * depends on the same DNS records. Confirms:
 *   - getDomainAuthStatus() is called on mount with no gating prop
 *   - an authenticated domain renders the "Authenticated" state
 *   - a failing check renders "Needs attention" plus the failing record
 *   - an unchecked/unconfigured result renders nothing (no permanent
 *     "unknown" card)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const getDomainAuthStatus = vi.fn();

vi.mock('@/app/golf/actions/crm-gmail-send', () => ({
  getDomainAuthStatus: (...args: unknown[]) => getDomainAuthStatus(...args),
}));

import { DomainAuthCard } from '../DomainAuthCard';

describe('DomainAuthCard', () => {
  beforeEach(() => {
    getDomainAuthStatus.mockReset();
  });

  it('calls getDomainAuthStatus on mount with no arguments (unconditional check)', async () => {
    getDomainAuthStatus.mockResolvedValue({ checked: false });
    render(<DomainAuthCard />);
    await waitFor(() => expect(getDomainAuthStatus).toHaveBeenCalledTimes(1));
    expect(getDomainAuthStatus).toHaveBeenCalledWith();
  });

  it('renders nothing while unchecked (e.g. no domain configured)', async () => {
    getDomainAuthStatus.mockResolvedValue({ checked: false });
    const { container } = render(<DomainAuthCard />);
    await waitFor(() => expect(getDomainAuthStatus).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders "Authenticated" when SPF/DKIM/DMARC all pass', async () => {
    getDomainAuthStatus.mockResolvedValue({
      checked: true,
      result: {
        domain: 'helmsportslabs.com',
        spf: { ok: true, detail: 'SPF authorizes Google (_spf.google.com)' },
        dkim: { ok: true, detail: 'DKIM present (selector: google)' },
        dmarc: { ok: true, detail: 'DMARC present (p=quarantine)' },
        ok: true,
      },
    });
    render(<DomainAuthCard />);
    expect(await screen.findByText('Authenticated')).toBeInTheDocument();
    // The card is explicitly scoped to the Gmail-direct path (it cannot speak
    // for Resend's own domain verification) — pin that honest labeling.
    expect(screen.getByText('Domain authentication (Gmail direct sends)')).toBeInTheDocument();
    expect(screen.getByText(/helmsportslabs\.com/)).toBeInTheDocument();
  });

  it('renders "Needs attention" when a record fails', async () => {
    getDomainAuthStatus.mockResolvedValue({
      checked: true,
      result: {
        domain: 'helmsportslabs.com',
        spf: { ok: true, detail: 'SPF authorizes Google (_spf.google.com)' },
        dkim: { ok: false, detail: 'No DKIM at google._domainkey' },
        dmarc: { ok: true, detail: 'DMARC present (p=quarantine)' },
        ok: false,
      },
    });
    render(<DomainAuthCard />);
    expect(await screen.findByText('Needs attention')).toBeInTheDocument();
    expect(screen.getByText('No DKIM at google._domainkey')).toBeInTheDocument();
  });
});
