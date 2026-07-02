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
    });
  } catch {
    // Never fail boot for a marker.
  }
}
