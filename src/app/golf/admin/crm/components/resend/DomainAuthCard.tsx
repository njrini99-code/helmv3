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
    <div className="glass-standard rounded-2xl p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'p-1.5 rounded-full',
              ok ? 'bg-primary-50 text-primary-600' : 'bg-amber-50 text-amber-600'
            )}
          >
            <IconGlobe size={16} />
          </span>
          <div>
            <p className="text-sm font-semibold text-warm-900">
              Domain authentication
            </p>
            <p className="text-xs text-warm-500">{domain}</p>
          </div>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold',
            ok
              ? 'bg-primary-50 border-primary-200/60 text-primary-700'
              : 'bg-amber-50 border-amber-200/60 text-amber-700'
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
              'flex items-center gap-2 rounded-xl border px-3 py-2 cursor-help',
              check.ok
                ? 'bg-primary-50/50 border-primary-200/60'
                : 'bg-amber-50/50 border-amber-200/60'
            )}
          >
            {check.ok ? (
              <IconCheckCircle2 size={14} className="text-primary-600 shrink-0" />
            ) : (
              <IconWarning size={14} className="text-amber-600 shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-warm-900">{label}</p>
              <p className="text-caption text-warm-500 truncate">{check.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
