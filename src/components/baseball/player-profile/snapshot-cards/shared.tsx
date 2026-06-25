// =============================================================================
// src/components/baseball/player-profile/snapshot-cards/shared.tsx
//
// Shared presentational primitives for the V7 Player Profile Snapshot Cards.
// Cream/green GolfHelm look, baseball-only labels. Pure presentational — every
// card is gated on `present` by the read model, so these primitives just render
// what they're handed (incl. honest empty/stale states). No I/O, no fetch.
// =============================================================================

import type { ReactNode } from 'react';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import type { SourceTrust } from '@/components/baseball/source-trust/source-trust-types';

// ─── Formatters ──────────────────────────────────────────────────────────────

/** Slash-stat formatter — ".312", null -> "—". */
export function fmtAvg(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.');
}

/** Rate stat (ERA/WHIP) — 2 decimals, null -> "—". */
export function fmtRate(v: number | null | undefined, dp = 2): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return v.toFixed(dp);
}

/** Integer / count, null -> "—". */
export function fmtInt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return String(Math.round(v));
}

/** Percent with one decimal, null -> "—". Pass already-scaled 0–100 value. */
export function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(1)}%`;
}

/** Signed number, null -> "—". */
export function fmtSigned(v: number | null | undefined, suffix = ''): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${v}${suffix}`;
}

/** Short date "Mar 4", null -> "—". */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** "3d ago" style relative freshness, null -> null (no line). */
export function fmtFreshness(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// ─── Card shell ──────────────────────────────────────────────────────────────

export interface SnapshotCardShellProps {
  title: string;
  icon: ReactNode;
  /** Right-aligned accessory (e.g. a "View →" link or count chip). */
  accessory?: ReactNode;
  /** Source-trust posture for the card's primary source (renders a small chip). */
  trust?: SourceTrust | null;
  /** Most-recent source timestamp (renders an "as of" freshness line). */
  asOf?: string | null;
  /** When true, the card is NOT present — renders the honest empty body. */
  empty?: boolean;
  emptyLabel?: string;
  /** Accent hue for the icon chip (cream/green palette only). */
  accent?: 'primary' | 'amber' | 'warm' | 'red';
  children?: ReactNode;
  className?: string;
}

const ACCENT: Record<NonNullable<SnapshotCardShellProps['accent']>, string> = {
  primary: 'bg-primary-100 text-primary-700',
  amber: 'bg-amber-100 text-amber-700',
  warm: 'bg-warm-100 text-warm-600',
  red: 'bg-red-100 text-red-700',
};

export function SnapshotCardShell({
  title,
  icon,
  accessory,
  trust,
  asOf,
  empty,
  emptyLabel,
  accent = 'primary',
  children,
  className = '',
}: SnapshotCardShellProps) {
  const fresh = fmtFreshness(asOf);
  return (
    <section
      className={`bg-cream-100/75 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm p-5 flex flex-col ${className}`}
    >
      <header className="flex items-center gap-2.5 mb-4">
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${ACCENT[accent]}`}>
          {icon}
        </span>
        <h3 className="font-semibold text-warm-900 text-sm leading-tight flex-1 min-w-0 truncate">{title}</h3>
        {accessory}
      </header>

      {empty ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
          <p className="text-sm text-warm-400 font-medium">{emptyLabel ?? 'No data captured yet'}</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">{children}</div>
      )}

      {!empty && (trust || fresh) && (
        <footer className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-warm-100">
          {trust ? <SourceTrustBadge trust={trust} size="sm" /> : <span />}
          {fresh && <span className="text-eyebrow text-warm-400 tabular-nums">as of {fresh}</span>}
        </footer>
      )}
    </section>
  );
}

// ─── Stat tile (small KPI inside a card) ─────────────────────────────────────

export function StatTile({
  label,
  value,
  sub,
  emphasis,
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-xl bg-cream-50/70 border border-warm-200/40 px-3 py-2.5">
      <p className="text-eyebrow font-medium text-warm-400 uppercase tracking-wide">{label}</p>
      <p className={`tabular-nums leading-none mt-1 ${emphasis ? 'text-xl font-bold text-warm-900' : 'text-lg font-semibold text-warm-900'}`}>
        {value}
      </p>
      {sub && <p className="text-eyebrow text-warm-400 mt-1">{sub}</p>}
    </div>
  );
}

// ─── Tone chip (status / readiness) ──────────────────────────────────────────

const TONE: Record<'success' | 'warning' | 'error' | 'info' | 'neutral', string> = {
  success: 'bg-primary-100 text-primary-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
  info: 'bg-primary-50 text-primary-700',
  neutral: 'bg-warm-100 text-warm-600',
};

export function ToneChip({
  tone = 'neutral',
  children,
  icon,
}: {
  tone?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${TONE[tone]}`}>
      {icon}
      {children}
    </span>
  );
}
