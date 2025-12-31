'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { processGolfTeamInvitation } from '@/app/golf/actions/teams';

interface GolfJoinTeamClientProps {
  inviteCode: string;
  playerId: string;
  playerName: string;
  playerYear: string;
  team: {
    id: string;
    name: string;
    season?: string | null;
    organization?: {
      name: string;
      city?: string | null;
      state?: string | null;
      logoUrl?: string | null;
    };
  };
}

export function GolfJoinTeamClient({
  inviteCode,
  playerId,
  playerName,
  playerYear,
  team,
}: GolfJoinTeamClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoinTeam() {
    setLoading(true);
    setError(null);

    const result = await processGolfTeamInvitation(inviteCode, playerId);

    if (!result.success) {
      setError(result.error || 'Failed to join team');
      setLoading(false);
      return;
    }

    // Success! Redirect to golf dashboard
    router.push('/golf/dashboard');
  }

  return (
    <div className="min-h-screen bg-[#FAF6F1] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-br from-green-50 to-white border-b border-slate-200 p-8 text-center">
          {team.organization?.logoUrl ? (
            <img
              src={team.organization.logoUrl}
              alt={team.organization.name}
              className="w-20 h-20 object-contain mx-auto mb-4 rounded-lg"
            />
          ) : (
            <div className="w-20 h-20 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">
            Join {team.name}
          </h1>
          {team.organization && (
            <p className="text-slate-600">
              {team.organization.name}
              {team.organization.city && team.organization.state && (
                <span className="text-slate-400"> • {team.organization.city}, {team.organization.state}</span>
              )}
            </p>
          )}
          {team.season && (
            <p className="text-sm text-slate-500 mt-1">{team.season}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="mb-6">
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-slate-500">Joining as</p>
                <p className="font-semibold text-slate-900">{playerName}</p>
                <p className="text-xs text-slate-500 capitalize">{playerYear.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-green-800 mb-1">One Team Only</p>
                <p className="text-xs text-green-700">
                  Golf players can only be on one team at a time. If you're currently on another team, you'll need to leave it before joining this one.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleJoinTeam}
              disabled={loading}
              className="w-full px-6 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Joining Team...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Confirm & Join Team
                </>
              )}
            </button>
            <button
              onClick={() => router.push('/golf/dashboard')}
              disabled={loading}
              className="w-full px-6 py-3 bg-white text-slate-700 font-medium rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center">
              By joining this team, you'll have access to team schedules, rounds, messages, and other team features.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
