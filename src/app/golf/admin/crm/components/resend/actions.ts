'use server';

// ============================================================================
// Deliverability-tab-local server actions.
//
// getFailedEmailCounts() exists because the "Failed" sub-tab's Bounces /
// Complaints summary used to be derived client-side from a capped 150-row
// fetch (`getFailedEmails(150)`), which silently understates the true totals
// once bounced+complained volume exceeds the cap. This does a real SQL
// COUNT (head:true, no rows transferred) so the summary numbers are always
// exact, independent of how many rows the list underneath chooses to show.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

async function requireAdmin(): Promise<AnySupabase> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden');
  }

  return supabase as AnySupabase;
}

export interface FailedEmailCounts {
  bounced: number;
  complained: number;
}

export async function getFailedEmailCounts(): Promise<FailedEmailCounts> {
  let supabase: AnySupabase;
  try {
    supabase = await requireAdmin();
  } catch {
    return { bounced: 0, complained: 0 };
  }

  const [bouncedRes, complainedRes] = await Promise.all([
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .not('bounced_at', 'is', null),
    supabase
      .from('emails')
      .select('id', { count: 'exact', head: true })
      .not('complained_at', 'is', null),
  ]);

  if (bouncedRes.error || complainedRes.error) {
    await logServerError(
      `[resend/deliverability] failed email counts query failed: ${
        bouncedRes.error?.message ?? complainedRes.error?.message ?? 'unknown error'
      }`,
      { action: 'resend_deliverability.getFailedEmailCounts' }
    );
    return { bounced: 0, complained: 0 };
  }

  return {
    bounced: bouncedRes.count ?? 0,
    complained: complainedRes.count ?? 0,
  };
}
