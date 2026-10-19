'use client';

import { getGolfCoachEntry } from '@/app/golf/actions/coach-entry';
import { createClient } from '@/lib/supabase/client';

/**
 * CH-15952: who may see the new-program questions, decided the way today's /golf/coach decides it (its page is a client page, so
 * this runs in the browser too, with the same calls in the same order), because finishing them creates an organization
 * and a team and makes the person its head coach:
 *
 *  - the session is read with a few tries (a fresh sign-up's cookie may not have landed), and no session is sign in;
 *  - a coach who already belongs to a program (an assistant, pending or approved) goes where `getGolfCoachEntry` says,
 *    because finishing this form would detach them from the program that invited them (the duplicate-program bug);
 *  - a player is sent to the dashboard: finishing it would give a player account a coach row.
 */
export type CoachEntry = { kind: 'ready'; seed: { first: string; last: string; email: string } } | { kind: 'go'; to: string };

export interface CoachGuardDeps {
  /** The session's user, null when there is none yet, `'timeout'` when the auth server did not answer in time. */
  getUser: () => Promise<{ user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null } | null; failed: boolean } | 'timeout'>;
  entry: () => Promise<{ path: string } | null>;
  hasCoachRow: (userId: string) => Promise<boolean>;
  hasPlayerRow: (userId: string) => Promise<boolean>;
  wait: (ms: number) => Promise<void>;
}

const TRIES = 5;

export async function resolveCoachEntry(deps: CoachGuardDeps): Promise<CoachEntry> {
  let user: NonNullable<Awaited<ReturnType<CoachGuardDeps['getUser']>>> extends infer R ? (R extends { user: infer U } ? U : never) : never = null;
  for (let attempt = 0; attempt < TRIES; attempt++) {
    const r = await deps.getUser();
    if (r === 'timeout' || r.failed) return { kind: 'go', to: '/golf/login' };
    if (r.user) {
      user = r.user;
      break;
    }
    if (attempt < TRIES - 1) await deps.wait(500);
  }
  if (!user) return { kind: 'go', to: '/golf/login' };

  const entry = await deps.entry();
  if (entry && entry.path !== '/golf/coach') return { kind: 'go', to: entry.path };

  const coach = await deps.hasCoachRow(user.id);
  if (!coach && (await deps.hasPlayerRow(user.id))) return { kind: 'go', to: '/golf/dashboard' };

  const meta = user.user_metadata ?? {};
  const first = typeof meta.first_name === 'string' ? meta.first_name : '';
  const last = typeof meta.last_name === 'string' ? meta.last_name : '';
  return { kind: 'ready', seed: { first: first && last ? first : '', last: first && last ? last : '', email: user.email ?? '' } };
}

export function browserCoachGuard(): CoachGuardDeps {
  const supabase = createClient();
  return {
    async getUser() {
      const r = await Promise.race([supabase.auth.getUser(), new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500))]);
      if (!r) return 'timeout';
      return { user: r.data.user, failed: !!r.error };
    },
    entry: () => getGolfCoachEntry(),
    // A read that fails keeps the person on this page: an unread coach row counts as present and an unread player row
    // as absent, so a failure never sends a coach to the player dashboard.
    async hasCoachRow(userId) {
      const { data, error } = await supabase.from('golf_coaches').select('id, onboarding_completed').eq('user_id', userId).maybeSingle();
      return error ? true : !!data;
    },
    async hasPlayerRow(userId) {
      const { data, error } = await supabase.from('golf_players').select('id').eq('user_id', userId).maybeSingle();
      return error ? false : !!data;
    },
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}
