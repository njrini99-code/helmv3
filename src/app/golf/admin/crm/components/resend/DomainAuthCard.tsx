'use client';

// ============================================================================
// DOMAIN AUTH CARD — SPF / DKIM / DMARC status for the sending domain.
// ============================================================================
//
// Resend sending (like Gmail direct-send) depends on the same SPF/DKIM/DMARC
// DNS records for the sending domain, so this check has to be visible here
// too — not just inside the Gmail-direct-send template bar, which is gated
// behind `gmailDirectEnabled` and stays dark whenever that's unconfigured.
// getDomainAuthStatus() is already admin-gated server-side (requireAdmin
// inside crm-gmail-send.ts), so it's safe to fire unconditionally on mount.
// ============================================================================

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { IconGlobe, IconWarning, IconCheckCircle2 } from '@/components/icons';
import { getDomainAuthStatus } from '@/app/golf/actions/crm-gmail-send';
import type { DomainAuthResult } from '@/lib/crm/domain-auth-check';

export function DomainAuthCard() {
  const [status, setStatus] = useState<
    { checked: boolean; result?: DomainAuthResult } | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    getDomainAuthStatus()
      .then((r) => {
        if (!cancelled) setStatus(r);
      })
      .catch(() => {
        if (!cancelled) setStatus({ checked: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing to show yet, or no domain configured to check — stay silent
  // rather than render a permanent "unknown" card.
  if (!status || !status.checked || !status.result) return null;

  const { domain, spf, dkim, dmarc, ok } = status.result;

  const rows: { label: string; check: { ok: boolean; detail: string } }[] = [
    { label: 'SPF', check: spf },
    { label: 'DKIM', check: dkim },
    { label: 'DMARC', check: dmarc },
  ];

  return (
    <div className="rounded-card border border-border-subtle bg-surface [box-shadow:var(--fw-shadow-card)] p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'p-1.5 rounded-full',
              ok ? 'bg-accent-50 text-accent-700' : 'bg-fw-warning-bg text-fw-warning-ink'
            )}
          >
            <IconGlobe size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              Domain authentication (Gmail direct sends)
            </p>
            {/* This card verifies the Workspace/DNS records the Gmail-direct
                path depends on. Resend verifies its own sending domain
                separately (Resend dashboard) — this check cannot speak for it. */}
            <p className="text-xs text-text-tertiary">
              {domain} · Resend&apos;s own domain status lives in the Resend dashboard
            </p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
            ok
              ? 'bg-accent-50 border-accent-200/60 text-accent-700'
              : 'bg-fw-warning-bg border-fw-warning-ring text-fw-warning-ink'
          )}
        >
          {ok ? (
            <>
              <IconCheckCircle2 size={12} /> Authenticated
            </>
          ) : (
            <>
              <IconWarning size={12} /> Needs attention
            </>
          )}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.map(({ label, check }) => (
          <div
            key={label}
            title={check.detail}
            className={cn(
              'flex items-center gap-2 rounded-fw-md border px-3 py-2 cursor-help',
              check.ok
                ? 'bg-accent-50/50 border-accent-200/60'
                : 'bg-fw-warning-bg/50 border-fw-warning-ring'
            )}
          >
            {check.ok ? (
              <IconCheckCircle2 size={14} className="text-accent-700 shrink-0" />
            ) : (
              <IconWarning size={14} className="text-fw-warning-ink shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-text-primary">{label}</p>
              <p className="text-caption text-text-tertiary truncate">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
