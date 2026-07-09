'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { processTeamInvitation, joinTeamByCode } from '@/app/baseball/actions/teams';
import Image from 'next/image';
import { m, useReducedMotion } from 'framer-motion';
import { IconCheck, IconUsers, IconUser, IconArrowLeft } from '@/components/icons';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { InlineNotice } from '@/components/fairway';
import { PaperCard, HairlineRule, stampPress, inkBleed } from '@/components/baseball/living-annual';

// ============================================================================
// JOIN SEAL — the ceremony object (island-join-ceremony packet).
//
// Replaces the old rainbow-confetti + 🎉-emoji celebration with one stamp
// ceremony in team green: a `--team-ink` embossed seal (kit `stampPress` +
// `inkBleed` motion — same grammar as `<CommitSeal>`, recolored for the
// team/development lane per the design-system's two-ink law) pressing down
// over an ink-bleed bloom. `<CommitSeal>` itself is hardcoded oxblood
// (reserved for recruiting COMMITTED/OFFER moments) so this composes the
// same kit primitives locally rather than repurposing that component's ink.
// Honors `prefers-reduced-motion` via the shared motion variants.
// ============================================================================
function JoinSeal() {
  const reduced = useReducedMotion() ?? false;
  return (
    <div className="relative inline-grid place-items-center">
      <m.span
        aria-hidden
        initial="hidden"
        animate="visible"
        variants={inkBleed(reduced)}
        className="pointer-events-none absolute h-24 w-24 rounded-full blur-md"
        style={{ background: 'var(--team-ink)' }}
      />
      <m.div
        initial="hidden"
        animate="visible"
        variants={stampPress(reduced)}
        style={{ rotate: -1.5 }}
        className="relative inline-grid h-24 w-24 place-items-center rounded-full text-[color:var(--paper)] shadow-[inset_0_2px_4px_rgba(0,0,0,0.3),inset_0_-1px_2px_rgba(255,255,255,0.15),0_2px_6px_rgba(0,0,0,0.2)]"
      >
        <span aria-hidden className="absolute inset-0 rounded-full" style={{ background: 'var(--team-ink)' }} />
        <span aria-hidden className="absolute inset-[12%] rounded-full border border-[rgba(255,255,255,0.32)]" />
        <IconCheck size={32} className="relative" aria-hidden />
      </m.div>
    </div>
  );
}

interface JoinTeamClientProps {
  inviteCode: string;
  playerId: string;
  playerName: string;
  playerType: string;
  /**
   * True when the code resolved from `baseball_team_invitations` (single-use /
   * expiring invite with redemption accounting); false for a persistent
   * `baseball_teams.join_code`. Determines which server action redeems the code.
   */
  isInvitationBased: boolean;
  team: {
    id: string;
    name: string;
    teamType: string;
    season?: string | null;
    organization?: {
      name: string;
      city?: string | null;
      state?: string | null;
      logoUrl?: string | null;
    };
  };
}

type JoinState = 'idle' | 'loading' | 'success' | 'error';

export function JoinTeamClient({
  inviteCode,
  playerId,
  playerName,
  playerType,
  isInvitationBased,
  team,
}: JoinTeamClientProps) {
  const router = useRouter();
  const [state, setState] = useState<JoinState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleJoinTeam() {
    setState('loading');
    setError(null);

    // Invitation-table codes go through processTeamInvitation (redemption
    // accounting on baseball_team_invitations); persistent team join codes go
    // through joinTeamByCode, which resolves baseball_teams.join_code. Routing
    // both to processTeamInvitation broke the primary college/JUCO invite path.
    const result = isInvitationBased
      ? await processTeamInvitation(inviteCode, playerId)
      : await joinTeamByCode(inviteCode, playerId);

    if (!result.success) {
      setError(result.error || 'Failed to join team');
      setState('error');
      return;
    }

    // Success! Show success state with animation
    setState('success');
    
    // Redirect after celebration
    setTimeout(() => {
      router.push('/baseball/player/today');
    }, 1500);
  }

  // Success state — the join ceremony (stamp seal, no confetti).
  if (state === 'success') {
    return (
      <div className="min-h-dvh bg-auth-baseball flex items-center justify-center p-6">
        <PaperCard className="max-w-lg w-full rounded-2xl animate-in zoom-in-95 duration-300">
          <div className="p-12 text-center">
            <div className="flex justify-center mb-6">
              <JoinSeal />
            </div>
            <div className="flex justify-center mb-5">
              <HairlineRule ink="team" className="w-16" />
            </div>
            <h1 className="text-2xl font-semibold text-warm-900 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
              Welcome to {team.name}
            </h1>
            <p className="text-warm-600 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200">
              You&apos;re now officially part of the team
            </p>
            <p className="text-sm text-warm-500 mt-4 animate-in fade-in duration-300 delay-300">
              Redirecting to your team dashboard...
            </p>
          </div>
        </PaperCard>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-auth-baseball flex items-center justify-center p-4 sm:p-6">
      <PaperCard className="max-w-lg w-full rounded-2xl">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-50/80 to-white/60 border-b border-[color:var(--hairline)] p-6 sm:p-8 text-center">
          {team.organization?.logoUrl ? (
            <Image
              src={team.organization.logoUrl}
              alt={team.organization.name}
              width={80}
              height={80}
              className="w-16 h-16 sm:w-20 sm:h-20 object-contain mx-auto mb-4 rounded-lg"
              unoptimized
            />
          ) : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <IconUsers size={32} className="text-primary-600" />
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-semibold text-warm-900 mb-2">
            Join {team.name}
          </h1>
          {team.organization && (
            <p className="text-warm-600 text-sm sm:text-base">
              {team.organization.name}
              {team.organization.city && team.organization.state && (
                <span className="text-warm-400"> • {team.organization.city}, {team.organization.state}</span>
              )}
            </p>
          )}
          {team.season && (
            <p className="text-sm text-warm-500 mt-1">{team.season}</p>
          )}
          {/* Team type badge */}
          <div className="mt-3">
            <span className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium",
              team.teamType === 'college' && "bg-blue-100 text-blue-700",
              team.teamType === 'juco' && "bg-purple-100 text-purple-700",
              team.teamType === 'high_school' && "bg-amber-100 text-amber-700",
              team.teamType === 'showcase' && "bg-primary-100 text-primary-700"
            )}>
              {team.teamType.replace('_', ' ').toUpperCase()} TEAM
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8">
          <div className="mb-6">
            <div className="flex items-center gap-3 p-4 bg-warm-50/80 rounded-lg border border-warm-200/50">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <IconUser size={20} className="text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-warm-500">Joining as</p>
                <p className="font-semibold text-warm-900 truncate">{playerName}</p>
                <p className="text-xs text-warm-500 capitalize">{playerType.replace('_', ' ')} Player</p>
              </div>
            </div>
          </div>

          {/* Error state — shared InlineNotice, not an ad-hoc red box. */}
          {state === 'error' && error && (
            <div className="mb-6">
              <InlineNotice tone="danger" title="Unable to join team">
                {error}
              </InlineNotice>
            </div>
          )}

          <div className="space-y-3">
            <Button variant="primary"
              onClick={handleJoinTeam}
              disabled={state === 'loading'}
              className="w-full px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 active:bg-primary-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {state === 'loading' ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Joining Team...</span>
                </>
              ) : (
                <>
                  <IconCheck size={20} />
                  <span>Confirm & Join Team</span>
                </>
              )}
            </Button>
            <Button variant="ghost"
              onClick={() => router.push('/baseball/player/today')}
              disabled={state === 'loading'}
              className="w-full px-6 py-3 bg-cream-50 text-warm-700 font-medium rounded-lg border border-warm-200 hover:bg-warm-50 active:bg-warm-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <IconArrowLeft size={18} />
              <span>Cancel</span>
            </Button>
          </div>

          <div className="mt-6 pt-6 border-t border-warm-200/50">
            <p className="text-xs text-warm-500 text-center">
              By joining this team, you&apos;ll have access to team schedules, messages, and other team features.
            </p>
          </div>
        </div>
      </PaperCard>
    </div>
  );
}
