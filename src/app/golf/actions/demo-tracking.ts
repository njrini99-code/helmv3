'use server';

/**
 * Demo session tracking — admin-only server actions.
 *
 * Reads from `golf_demo_sessions` via the service-role (admin) client because
 * that table is RLS-locked (no public select policy).  The admin-identity check
 * runs FIRST via the user-scoped client so we never expose the admin bypass to
 * non-admins.
 */

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface DemoSession {
  id: string;
  name: string;
  email: string;
  school: string | null;
  ip: string | null;
  user_agent: string | null;
  referrer: string | null;
  entered_at: string;
  metadata: Record<string, unknown>;
}

export interface GetDemoSessionsResult {
  sessions: DemoSession[];
  total: number;
}

/**
 * Return the most-recent demo session rows (limit 200), ordered newest first.
 * Throws 'Forbidden' if the caller is not an admin.
 */
export async function getDemoSessions(): Promise<GetDemoSessionsResult> {
  // 1. Verify caller is authenticated and has admin role
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');

  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (userErr || userRow?.role !== 'admin') throw new Error('Forbidden');

  // 2. Fetch via admin client (bypasses RLS).
  //    NOTE: `golf_demo_sessions` is not yet in the generated Database type —
  //    the data agent creates that table (migration) after this code lands.
  //    We cast through `unknown` here; once `npm run db:types` is re-run the
  //    cast becomes redundant but harmless.
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyAdmin = admin as unknown as { from: (table: string) => any };
  const { data, error, count } = await anyAdmin
    .from('golf_demo_sessions')
    .select('*', { count: 'exact' })
    .order('entered_at', { ascending: false })
    .limit(200);

  if (error) throw error instanceof Error ? error : new Error(String(error));

  return {
    sessions: (data ?? []) as DemoSession[],
    total: count ?? 0,
  };
}
