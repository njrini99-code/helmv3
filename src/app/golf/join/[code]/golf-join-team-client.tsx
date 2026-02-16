'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJoinTeam() {
    setLoading(true);
    setError(null);

    try {
      const result = await processGolfTeamInvitation(inviteCode, playerId);

      if (!result.success) {
        setError(result.error || 'Failed to join team. Please try again.');
        setLoading(false);
        return;
      }

      // Show success feedback briefly before redirecting
      setSuccess(true);
      setLoading(false);

      // Redirect after brief delay to show success state
      setTimeout(() => {
        router.push('/golf/dashboard');
      }, 800);
    } catch (err) {
      console.error('Join team error:', err);
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-warm-200 overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary-50 to-white border-b border-warm-200 p-8 text-center">
          {team.organization?.logoUrl ? (
            <Image
              src={team.organization.logoUrl}
              alt={`${team.organization.name} team logo`}
              width={80}
              height={80}
              className="w-20 h-20 object-contain mx-auto mb-4 rounded-lg"
              unoptimized
            />
          ) : (
            <div className="w-20 h-20 bg-primary-100 rounded-lg flex items-center justify-center mx-auto mb-4">
              <svg className="w-10 h-10 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          )}
          <h1 className="text-2xl font-semibold text-warm-900 mb-2">
            Join {team.name}
          </h1>
          {team.organization && (
            <p className="text-warm-600">
              {team.organization.name}
              {team.organization.city && team.organization.state && (
                <span className="text-warm-400"> • {team.organization.city}, {team.organization.state}</span>
              )}
            </p>
          )}
          {team.season && (
            <p className="text-sm text-warm-500 mt-1">{team.season}</p>
          )}
        </div>

        {/* Body */}
        <div className="p-8">
          <div className="mb-6">
            <div className="flex items-center gap-3 p-4 bg-warm-50 rounded-lg border border-warm-200">
              <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-warm-500">Joining as</p>
                <p className="font-semibold text-warm-900">{playerName}</p>
                <p className="text-xs text-warm-500 capitalize">{playerYear.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-primary-800 mb-1">One Team Only</p>
                <p className="text-xs text-primary-700">
                  Golf players can only be on one team at a time. If you're currently on another team, you'll need to leave it before joining this one.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg" role="alert" aria-live="polite">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-lg" role="status" aria-live="polite">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm font-medium text-primary-600">Successfully joined {team.name}! Redirecting...</p>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={handleJoinTeam}
              disabled={loading || success}
              className="w-full px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-current skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                  </span>
                  Joining Team...
                </>
              ) : success ? (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Joined!
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
              disabled={success}
              className="w-full px-6 py-3 bg-white text-warm-700 font-medium rounded-lg border border-warm-200 hover:bg-warm-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>

          <div className="mt-6 pt-6 border-t border-warm-200">
            <p className="text-xs text-warm-500 text-center">
              By joining this team, you'll have access to team schedules, rounds, messages, and other team features.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
