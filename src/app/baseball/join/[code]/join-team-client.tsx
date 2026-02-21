'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { processTeamInvitation } from '@/app/baseball/actions/teams';
import Image from 'next/image';
import { IconCheck, IconUsers, IconUser, IconX, IconArrowLeft } from '@/components/icons';
import { cn } from '@/lib/utils';

interface JoinTeamClientProps {
  inviteCode: string;
  playerId: string;
  playerName: string;
  playerType: string;
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
  team,
}: JoinTeamClientProps) {
  const router = useRouter();
  const [state, setState] = useState<JoinState>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleJoinTeam() {
    setState('loading');
    setError(null);

    const result = await processTeamInvitation(inviteCode, playerId);

    if (!result.success) {
      setError(result.error || 'Failed to join team');
      setState('error');
      return;
    }

    // Success! Show success state with animation
    setState('success');
    
    // Redirect after celebration
    setTimeout(() => {
      router.push('/baseball/dashboard/team');
    }, 1500);
  }

  // Success state with celebration
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-auth-baseball flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white/80 backdrop-blur-xl rounded-2xl border border-white/30 overflow-hidden shadow-sm animate-in zoom-in-95 duration-300">
          <div className="p-12 text-center">
            {/* Success animation */}
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-in zoom-in-50 duration-500">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center animate-in zoom-in-50 duration-300 delay-200">
                <IconCheck size={32} className="text-white animate-in slide-in-from-bottom-2 duration-300 delay-300" />
              </div>
            </div>
            <h1 className="text-2xl font-semibold text-slate-900 mb-2 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-150">
              Welcome to the Team! 🎉
            </h1>
            <p className="text-slate-600 animate-in fade-in slide-in-from-bottom-2 duration-300 delay-200">
              You&apos;ve successfully joined <span className="font-medium">{team.name}</span>
            </p>
            <p className="text-sm text-slate-500 mt-4 animate-in fade-in duration-300 delay-300">
              Redirecting to your dashboard...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-auth-baseball flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-lg w-full bg-white/80 backdrop-blur-xl rounded-2xl border border-white/30 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-50/80 to-white/60 border-b border-white/30 p-6 sm:p-8 text-center">
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
          <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 mb-2">
            Join {team.name}
          </h1>
          {team.organization && (
            <p className="text-slate-600 text-sm sm:text-base">
              {team.organization.name}
              {team.organization.city && team.organization.state && (
                <span className="text-slate-400"> • {team.organization.city}, {team.organization.state}</span>
              )}
            </p>
          )}
          {team.season && (
            <p className="text-sm text-slate-500 mt-1">{team.season}</p>
          )}
          {/* Team type badge */}
          <div className="mt-3">
            <span className={cn(
              "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium",
              team.teamType === 'college' && "bg-blue-100 text-blue-700",
              team.teamType === 'juco' && "bg-purple-100 text-purple-700",
              team.teamType === 'high_school' && "bg-amber-100 text-amber-700",
              team.teamType === 'showcase' && "bg-green-100 text-green-700"
            )}>
              {team.teamType.replace('_', ' ').toUpperCase()} TEAM
            </span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 sm:p-8">
          <div className="mb-6">
            <div className="flex items-center gap-3 p-4 bg-slate-50/80 rounded-lg border border-slate-200/50">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <IconUser size={20} className="text-primary-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-500">Joining as</p>
                <p className="font-semibold text-slate-900 truncate">{playerName}</p>
                <p className="text-xs text-slate-500 capitalize">{playerType.replace('_', ' ')} Player</p>
              </div>
            </div>
          </div>

          {/* Error state */}
          {state === 'error' && error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <IconX size={12} className="text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-red-800">Unable to join team</p>
                <p className="text-sm text-red-600 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
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
            </button>
            <button
              onClick={() => router.push('/baseball/dashboard')}
              disabled={state === 'loading'}
              className="w-full px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <IconArrowLeft size={18} />
              <span>Cancel</span>
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200/50">
            <p className="text-xs text-slate-500 text-center">
              By joining this team, you&apos;ll have access to team schedules, messages, and other team features.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
