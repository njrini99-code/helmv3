import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Deploy markers — event_type='deploy' per production sha, detected at
 * server boot from Vercel system env (zero secrets). Charts overlay these
 * even before VERCEL_API_TOKEN exists. Fire-and-forget: any failure here
 * must never affect boot.
 */

let attemptedThisBoot = false;

export async function recordDeployMarker(): Promise<void> {
  if (attemptedThisBoot) return;
  attemptedThisBoot = true;

  try {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    if (process.env.VERCEL_ENV !== 'production' || !sha) return;

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from('admin_events')
      .select('id')
      .eq('event_type', 'deploy')
      .contains('metadata', { sha })
      .limit(1);
    if (existing && existing.length > 0) return;

    const nowIso = new Date().toISOString();
    await admin.from('admin_events').insert({
      event_type: 'deploy',
      title: `Deployed ${sha.slice(0, 7)} (${process.env.VERCEL_GIT_COMMIT_REF ?? 'unknown ref'})`,
      severity: 'info',
      message: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
      metadata: {
        sha,
        ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        author: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? null,
      },
      source: 'system',
      sport: 'shared',
      // A deploy marker is a pure activity record, not an incident — nothing
      // ever triages or resolves it (auto-resolve.ts and the triage UI both
      // filter event_type='error'), so it sat resolved=false forever with no
      // consumer that cared. Born resolved instead. See admin-logger.ts's
      // ACTIVITY_RECORD_EVENT_TYPES for the sibling write paths and the
      // measurement (538 such rows cleaned by hand 2026-08-20).
      resolved: true,
      resolved_at: nowIso,
    });
  } catch {
    // Never fail boot for a marker.
  }
}
