import 'server-only';
import { getUserResilient } from '@/lib/auth/resilient-get-user';
import { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';

const SURFACE = 'auth';
const AREA = 'golf_auth';

export type PlayerOnboardLoad =
  | { kind: 'signedOut' }
  | { kind: 'coach' }
  | { kind: 'onboarded' }
  | {
      kind: 'ready';
      seed: { first: string; last: string; grad: number | null; hcp: number | null; city: string; state: string; photoUrl: string | null; email: string; accountMade: true; intent: 'code'; kind: 'roster' };
    };

/**
 * Who lands on /golf/player, read the way today's page reads it: signed out
 * goes to sign in, a coach never becomes a player here, and someone already
 * onboarded goes to the dashboard. Everything else starts the player's
 * remaining questions, prefilled with what the account already holds.
 */
export async function loadPlayerOnboard(): Promise<PlayerOnboardLoad> {
  const supabase = await createClient();
  const { user } = await getUserResilient(supabase);
  if (!user) return { kind: 'signedOut' };

  const [coach, player] = await Promise.all([
    supabase.from('golf_coaches').select('id').eq('user_id', user.id).maybeSingle(),
    supabase.from('golf_players').select('first_name, last_name, graduation_year, handicap, handicap_index, hometown, state, avatar_url, onboarding_completed').eq('user_id', user.id).maybeSingle(),
  ]);
  if (coach.error) chLogServer(SURFACE, 'onboard.coach', coach.error, AREA);
  if (player.error) chLogServer(SURFACE, 'onboard.player', player.error, AREA);
  if (coach.data) return { kind: 'coach' };
  const p = player.data;
  if (p?.onboarding_completed) return { kind: 'onboarded' };

  const meta = (user.user_metadata ?? {}) as { first_name?: string; last_name?: string };
  const hcp = (p?.handicap ?? p?.handicap_index ?? null) as number | null;
  return {
    kind: 'ready',
    seed: {
      first: (p?.first_name as string | null) || meta.first_name || '',
      last: (p?.last_name as string | null) || meta.last_name || '',
      grad: (p?.graduation_year as number | null) ?? null,
      hcp: typeof hcp === 'number' && Number.isFinite(hcp) ? hcp : null,
      city: ((p?.hometown as string | null) ?? '').slice(0, 40),
      state: ((p?.state as string | null) ?? '').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase(),
      photoUrl: (p?.avatar_url as string | null) ?? null,
      email: user.email ?? '',
      accountMade: true,
      intent: 'code',
      kind: 'roster',
    },
  };
}
