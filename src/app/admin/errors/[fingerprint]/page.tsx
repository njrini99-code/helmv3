import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFingerprintDetail } from '@/lib/admin/data/errors';
import { StatusPill, type FwStatusTone } from '@/components/fairway';
import type { TriageSeverity } from '@/lib/admin/data/triage';

export const dynamic = 'force-dynamic';

const SEVERITY_TONE: Record<TriageSeverity, FwStatusTone> = {
  critical: 'danger',
  error: 'danger',
  warning: 'warning',
  info: 'neutral',
};

function severityTone(severity: string): FwStatusTone {
  return SEVERITY_TONE[severity as TriageSeverity] ?? 'neutral';
}

export default async function FingerprintDetailPage({
  params,
}: {
  params: Promise<{ fingerprint: string }>;
}) {
  await requireSuperAdmin();
  const { fingerprint } = await params;
  const { events } = await fetchFingerprintDetail(fingerprint);

  return (
    <main className="space-y-4 p-6">
      <Link href="/admin/errors" className="text-xs text-warm-500 underline">← Errors</Link>
      <h1 className="font-fw-mono text-lg text-warm-900">fingerprint {fingerprint}</h1>
      <p className="text-sm text-warm-600">{events.length} events · affected users link to Users & Teams</p>
      <ul className="space-y-3">
        {events.map((e) => (
          <li key={e.id} className="rounded-2xl border border-warm-200 bg-white/70 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-warm-900">{e.title}</p>
              <StatusPill tone={severityTone(e.severity)} dot size="sm">
                {e.severity}
              </StatusPill>
            </div>
            <p className="font-fw-mono text-xs tabular-nums text-warm-500">
              {e.created_at ? new Date(e.created_at).toLocaleString() : 'unknown time'} · {e.url ?? 'no url'}
            </p>
            {e.user_id ? (
              <Link href={`/admin/users/${e.user_id}`} className="text-xs text-accent-700 underline">
                {e.user_email ?? e.user_id}
              </Link>
            ) : null}
            {e.stack_trace ? (
              <pre className="mt-2 max-h-48 overflow-auto rounded bg-warm-100 p-2 text-caption">{e.stack_trace}</pre>
            ) : null}
          </li>
        ))}
      </ul>
    </main>
  );
}
