import Link from 'next/link';
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchFingerprintDetail } from '@/lib/admin/data/errors';
import { StatusPill, Surface, type FwStatusTone } from '@/components/fairway';
import type { TriageSeverity } from '@/lib/admin/data/triage';
import { PanelBoundary } from '../../_components/PanelBoundary';
import { PanelNoData } from '../../_components/PanelStates';

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

  async function Body() {
    const { events } = await fetchFingerprintDetail(fingerprint);

    if (events.length === 0) {
      return (
        <PanelNoData
          label="No events for this fingerprint"
          description="Either every event has been resolved or this fingerprint no longer matches any admin_events row."
        />
      );
    }

    return (
      <>
        <p className="text-sm text-warm-600">{events.length} events · affected users link to Users & Teams</p>
        <ul className="mt-3 space-y-3">
          {events.map((e) => (
            <Surface as="li" key={e.id} padding="sm">
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
            </Surface>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Link href="/admin/errors" className="text-xs text-warm-500 underline">← Errors</Link>
      <h1 className="font-fw-mono text-lg text-warm-900">fingerprint {fingerprint}</h1>
      <PanelBoundary title="Fingerprint detail">
        <Body />
      </PanelBoundary>
    </div>
  );
}
