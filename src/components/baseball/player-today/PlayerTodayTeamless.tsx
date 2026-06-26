'use client';

// =============================================================================
// src/components/baseball/player-today/PlayerTodayTeamless.tsx
//
// Terminal screen for an ONBOARDED-BUT-TEAMLESS player.
//
// Player onboarding explicitly allows finishing with NO team ("Skip for Now" /
// "you can join a team later from your dashboard"). For such a player the
// active baseball context is null (zero memberships), so the daily-loop read
// cannot resolve a team. PREVIOUSLY today/page.tsx redirect()'d to
// /baseball/player when context was null — but the onboarding guard bounces a
// completed player back to /baseball/dashboard, which re-dispatches to
// /baseball/player/today: a hard first-run redirect loop with no usable
// landing.
//
// This component is the honest TERMINAL the v12 "HONESTY" comment on the page
// always intended: instead of bouncing, the teamless player lands on a real,
// hand-crafted screen whose single primary task is "join a team" (inline,
// using the same invite-code flow as onboarding's team step). On success they
// have a membership, so /baseball/dashboard resolves to a real surface and the
// loop is gone.
//
// Additive + baseball-scoped. Reuses GolfHelm primitives (Card / Button /
// Input) and the cream/green system. Shares nothing with GolfHelm.
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  IconUsers,
  IconArrowRight,
  IconClipboardList,
  IconTarget,
  IconAlertCircle,
  IconCheck,
} from '@/components/icons';
import { processTeamInvitation } from '@/app/baseball/actions/teams';

/** What a teamless player unlocks the moment they join — sets the stakes. */
const UNLOCKS: ReadonlyArray<{ icon: React.ReactNode; label: string; copy: string }> = [
  {
    icon: <IconClipboardList size={18} />,
    label: 'Your daily loop',
    copy: "Today's schedule, your daily contract, and what needs your attention.",
  },
  {
    icon: <IconTarget size={18} />,
    label: 'Coach assignments',
    copy: 'Tasks and video requests your coach sends land here as real work.',
  },
  {
    icon: <IconUsers size={18} />,
    label: 'Team & passport',
    copy: 'Your roster, recent stats, and a source-backed development story.',
  },
];

export function PlayerTodayTeamless() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();

  const [inviteCode, setInviteCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [joinedTeamName, setJoinedTeamName] = useState<string | null>(null);

  async function handleJoin() {
    const code = inviteCode.trim();
    if (!code || joining) return;

    setJoining(true);
    setError('');

    try {
      // An onboarded player has a baseball_players row keyed to their auth user;
      // resolve its id (RLS-scoped to the signed-in user) so processTeamInvitation
      // can verify ownership. Mirrors the onboarding team step's player lookup.
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('Your session expired. Please sign in again.');
        setJoining(false);
        return;
      }
      const { data: playerRow } = await supabase
        .from('baseball_players')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!playerRow?.id) {
        setError('Unable to load your profile. Please try again.');
        setJoining(false);
        return;
      }
      const playerId = playerRow.id;

      const result = await processTeamInvitation(code, playerId);
      if (!result.success) {
        setError(result.error || 'That code did not work. Check it with your coach and try again.');
        setJoining(false);
        return;
      }

      // Resolve the joined team's name for the confirmation copy (best-effort;
      // the join itself already succeeded so a missing name never blocks). Same
      // lookup the onboarding team step uses.
      let teamName = '';
      try {
        type TeamMemberWithTeam = { baseball_teams: { name: string } | null };
        const { data } = (await supabase
          .from('baseball_team_members')
          .select('baseball_teams!inner (name)')
          .eq('player_id', playerId)
          .order('joined_at', { ascending: false })
          .limit(1)
          .maybeSingle()) as unknown as { data: TeamMemberWithTeam | null };
        teamName = data?.baseball_teams?.name ?? '';
      } catch {
        // Non-fatal — fall back to the generic confirmation copy.
      }

      // Success — confirm, then route directly to the player daily loop.
      setJoinedTeamName(teamName);
      router.refresh();
      router.replace('/baseball/player/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setJoining(false);
    }
  }

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] as const },
      };

  // Brief success confirmation before the dispatcher navigates away.
  if (joinedTeamName !== null) {
    return (
      <LazyMotion features={domAnimation} strict>
        <div className="flex min-h-dvh items-center justify-center bg-cream-100 px-4">
          <m.div {...fade} className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-100">
              <IconCheck size={32} className="text-primary-600" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-warm-900">
              You&apos;re on the roster
            </h1>
            <p className="mt-2 text-warm-500">
              {joinedTeamName ? (
                <>
                  Welcome to <span className="font-medium text-primary-600">{joinedTeamName}</span>.
                </>
              ) : (
                <>Taking you to your dashboard…</>
              )}
            </p>
          </m.div>
        </div>
      </LazyMotion>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="min-h-dvh bg-cream-100">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-20">
          {/* Hero — clear purpose, one task. */}
          <m.header {...fade} className="text-center">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 ring-1 ring-primary-200">
              <IconUsers size={26} className="text-primary-600" />
            </div>
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-primary-600">
              Today
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-warm-900 sm:text-4xl">
              Join a team to unlock Today
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-warm-500">
              Your daily loop lives on a team roster. You finished setup without
              a team — enter the invite code your coach gave you to get started.
            </p>
          </m.header>

          {/* Primary action — the invite-code join, front and center. */}
          <m.div
            {...fade}
            className="glass-standard mx-auto mt-10 max-w-md rounded-2xl p-6 shadow-glass sm:p-8"
          >
            <Input
              label="Team invite code"
              value={inviteCode}
              onChange={(e) => {
                setInviteCode(e.target.value.toUpperCase());
                if (error) setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && inviteCode.trim() && !joining) {
                  e.preventDefault();
                  void handleJoin();
                }
              }}
              placeholder="Enter code (e.g. ABC123)"
              maxLength={20}
              className="text-center font-mono text-lg tracking-widest"
              error={error || undefined}
            />

            {error && (
              <m.p
                initial={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
              >
                <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </m.p>
            )}

            <Button
              onClick={() => void handleJoin()}
              disabled={!inviteCode.trim() || joining}
              isLoading={joining}
              size="lg"
              className="mt-5 w-full"
              rightIcon={<IconArrowRight size={16} />}
            >
              Join team
            </Button>

            <p className="mt-4 text-center text-xs text-warm-400">
              Don&apos;t have a code? Ask your coach to send you an invite link.
            </p>
          </m.div>

          {/* What joining unlocks — gives the empty state real substance + stakes. */}
          <m.ul {...fade} className="mx-auto mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            {UNLOCKS.map((u) => (
              <li
                key={u.label}
                className="glass-subtle rounded-2xl p-4"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
                  {u.icon}
                </div>
                <p className="text-sm font-semibold text-warm-900">{u.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-warm-500">{u.copy}</p>
              </li>
            ))}
          </m.ul>
        </div>
      </div>
    </LazyMotion>
  );
}
