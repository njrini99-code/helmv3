'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LazyMotion, domAnimation, m, useReducedMotion } from 'framer-motion';
import { processGolfTeamInvitation } from '@/app/golf/actions/teams';
import { Button } from '@/components/ui/button';

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

const fadeIn = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const } },
};

/**
 * Format the player's class for display. A 4-digit graduation year (e.g. "2027")
 * renders as "Class of 2027" — the label the UI expects. Anything else (legacy
 * tokens like "freshman"/"sophomore") falls back to the prior token formatting.
 */
function formatPlayerYear(value: string): string {
  if (/^\d{4}$/.test(value)) {
    return `Class of ${value}`;
  }
  return value.replace('_', ' ');
}

export function GolfJoinTeamClient({
  inviteCode,
  playerId,
  playerName,
  playerYear,
  team,
}: GolfJoinTeamClientProps) {
  const prefersReducedMotion = useReducedMotion();
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
    } catch {
      setError('Network error. Please check your connection and try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-auth-golf relative">
      {/* Floating Orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="auth-orb auth-orb-1 w-[400px] h-[400px] sm:w-[500px] sm:h-[500px] -top-24 -right-24 bg-gradient-to-br from-helm-primary-400/40 to-helm-primary-500/25" />
        <div className="auth-orb auth-orb-2 w-[350px] h-[350px] sm:w-[400px] sm:h-[400px] -bottom-20 -left-20 bg-gradient-to-tr from-helm-primary-400/25 to-helm-primary-400/15" />
        <div className="auth-orb auth-orb-3 hidden sm:block w-[200px] h-[200px] top-1/3 left-[8%] bg-gradient-to-br from-helm-primary-300/20 to-helm-primary-400/15" />
      </div>

      <div className="relative min-h-dvh flex flex-col items-center justify-center p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <LazyMotion features={domAnimation}>
          {/* Logo */}
          <m.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.5, delay: 0.1 })}
            className="mb-6 sm:mb-8"
          >
            <div className="relative">
              <div className="absolute inset-0 bg-helm-primary-500/25 rounded-full blur-xl scale-150" />
              <Image
                src="/helm-golf-logo-transparent.png"
                alt="GolfHelm"
                width={48}
                height={48}
                className="relative w-10 h-10 sm:w-12 sm:h-12 object-contain"
                priority
                unoptimized
              />
            </div>
          </m.div>

          <m.div
            variants={fadeIn}
            initial="initial"
            animate="animate"
            className="w-full max-w-lg"
          >
            <div className="auth-glass-card rounded-3xl overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-br from-primary-50/80 to-white/50 border-b border-warm-200/45 p-6 sm:p-8 text-center">
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
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-warm-900">
                  Join {team.name}
                </h1>
                {team.organization && (
                  <p className="text-warm-600 mt-2 text-sm sm:text-base">
                    {team.organization.name}
                    {team.organization.city && team.organization.state && (
                      <span className="text-warm-400"> &bull; {team.organization.city}, {team.organization.state}</span>
                    )}
                  </p>
                )}
                {team.season && (
                  <p className="text-sm text-warm-500 mt-1">{team.season}</p>
                )}
              </div>

              {/* Body */}
              <div className="p-6 sm:p-8">
                <div className="mb-6">
                  <div className="flex items-center gap-3 p-4 bg-warm-50/80 rounded-xl border border-warm-200/50">
                    <div className="w-10 h-10 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm text-warm-500">Joining as</p>
                      <p className="font-semibold text-warm-900">{playerName}</p>
                      <p className="text-xs text-warm-500 first-letter:capitalize">{formatPlayerYear(playerYear)}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-6 p-4 bg-primary-50/80 border border-primary-200/50 rounded-xl">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-primary-800 mb-1">One Team Only</p>
                      <p className="text-xs text-primary-700">
                        Golf players can only be on one team at a time. If you&apos;re currently on another team, you&apos;ll need to leave it before joining this one.
                      </p>
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl" role="alert" aria-live="polite">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="mb-6 p-4 bg-primary-50 border border-primary-200 rounded-xl" role="status" aria-live="polite">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <p className="text-sm font-medium text-primary-600">Successfully joined {team.name}! Redirecting...</p>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <Button variant="primary"
                    onClick={handleJoinTeam}
                    disabled={loading || success}
                    className="w-full px-6 py-3 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-primary-900/10 hover:shadow-xl hover:shadow-primary-900/15"
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
                        Confirm &amp; Join Team
                      </>
                    )}
                  </Button>
                  <Button variant="ghost"
                    onClick={() => router.push('/golf/dashboard')}
                    disabled={success}
                    className="w-full px-6 py-3 bg-cream-100/68 text-warm-700 font-semibold rounded-xl border border-warm-200/50 hover:bg-cream-100/82 active:bg-warm-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </Button>
                </div>

                <div className="mt-6 pt-6 border-t border-warm-200/50">
                  <p className="text-xs text-warm-500 text-center">
                    By joining this team, you&apos;ll have access to team schedules, rounds, messages, and other team features.
                  </p>
                </div>
              </div>
            </div>
          </m.div>
        </LazyMotion>
      </div>
    </div>
  );
}
