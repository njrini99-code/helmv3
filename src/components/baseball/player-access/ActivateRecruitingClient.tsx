'use client';

// =============================================================================
// src/components/baseball/player-access/ActivateRecruitingClient.tsx
//
// Thin client for the recruiting-activation surface. All auth/role/type/
// already-activated gating happens SERVER-SIDE in the page (getSessionProfile →
// redirect) before this component ever mounts, so it never renders an auth
// skeleton and can never strand on an infinite loading state. This component is
// only mounted for a signed-in, non-college player who has NOT yet activated.
//
// The activation write goes through the gated `activateRecruitingExposure`
// server action so the program's recruiting_exposure_enabled toggle is enforced
// server-side (a raw client update would bypass it).
// =============================================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IconTarget, IconUsers, IconChart, IconCheck, IconEye } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { activateRecruitingExposure } from '@/app/baseball/actions/player-access';

interface FeatureCard {
  icon: React.ReactNode;
  iconWrap: string;
  title: string;
  blurb: string;
  points: string[];
}

const FEATURES: FeatureCard[] = [
  {
    icon: <IconEye size={22} className="text-primary-600" />,
    iconWrap: 'bg-primary-50',
    title: 'Get discovered',
    blurb: 'Make your profile visible in coach searches and recommendations.',
    points: [
      'Appear in coach discovery searches',
      'Get matched with relevant programs',
      "See who's viewing your profile",
    ],
  },
  {
    icon: <IconUsers size={22} className="text-primary-600" />,
    iconWrap: 'bg-primary-50',
    title: 'Connect with coaches',
    blurb: 'See which coaches are interested and message them directly.',
    points: [
      'Know which coaches viewed you',
      'Track watchlist additions',
      'Direct messaging with coaches',
    ],
  },
  {
    icon: <IconTarget size={22} className="text-primary-600" />,
    iconWrap: 'bg-primary-50',
    title: 'Manage your journey',
    blurb: 'Track your recruiting progress and manage your college list.',
    points: [
      'Timeline of recruiting activity',
      'Track offers and commitments',
      'Organize your target schools',
    ],
  },
  {
    icon: <IconChart size={22} className="text-primary-600" />,
    iconWrap: 'bg-primary-50',
    title: 'Track analytics',
    blurb: 'Understand your recruiting reach and optimize your profile.',
    points: [
      'Profile view statistics',
      'Video engagement metrics',
      'Interest by program type',
    ],
  },
];

export function ActivateRecruitingClient({ playerId }: { playerId: string }) {
  const router = useRouter();
  const { updatePlayer } = useAuth();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleActivate = async () => {
    setActivating(true);
    setError(null);
    try {
      // Gated server action enforces the program's recruiting_exposure_enabled
      // toggle before flipping the player's activation flag.
      await activateRecruitingExposure();
      // Keep the shared auth store in sync so the destination renders activated.
      await updatePlayer?.({
        recruiting_activated: true,
        recruiting_activated_at: new Date().toISOString(),
      });
      router.push('/baseball/player/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setActivating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Hero */}
      <Card
        variant="glass"
        className="mb-6 overflow-hidden border-primary-200/70 bg-gradient-to-br from-primary-50 via-white to-white"
      >
        <CardContent className="p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600 shadow-glass">
            <IconTarget size={30} className="text-white" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-warm-900 sm:text-3xl">
            Ready to be recruited?
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-warm-600 sm:text-base">
            Activate recruiting to make your profile visible to college coaches and unlock the tools
            that help you get recruited to the next level.
          </p>
          <Badge variant="success" className="mt-5 px-4 py-1.5 text-sm">
            Free to activate · No credit card required
          </Badge>
        </CardContent>
      </Card>

      {/* Feature grid */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {FEATURES.map((f) => (
          <Card key={f.title} variant="glass" className="h-full">
            <CardHeader>
              <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${f.iconWrap}`}>
                {f.icon}
              </div>
              <h2 className="font-semibold text-warm-900">{f.title}</h2>
              <p className="mt-1 text-sm leading-relaxed text-warm-500">{f.blurb}</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-warm-600">
                {f.points.map((p) => (
                  <li key={p} className="flex items-start gap-2">
                    <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Privacy & control */}
      <Card variant="glass" className="mb-6">
        <CardHeader>
          <h2 className="font-semibold text-warm-900">You&apos;re in control</h2>
          <p className="mt-1 text-sm leading-relaxed text-warm-500">
            Activation is opt-in and reversible. You decide what coaches can see.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 text-sm text-warm-600 md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-medium text-warm-900">Privacy settings</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  <span>Control what information is visible</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  <span>Choose who can contact you</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  <span>Deactivate recruiting anytime</span>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-medium text-warm-900">Your data</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  <span>Your profile belongs to you</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  <span>Export your data anytime</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="mt-0.5 shrink-0 text-primary-600" />
                  <span>Delete your account anytime</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA */}
      <Card variant="glass" className="bg-gradient-to-br from-white to-primary-50/50">
        <CardContent className="p-8 text-center">
          {error && (
            <div
              role="alert"
              className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <Button
            size="lg"
            onClick={handleActivate}
            isLoading={activating}
            data-player-id={playerId}
            className="px-8"
          >
            Activate recruiting
          </Button>
          <p className="mt-4 text-sm leading-relaxed text-warm-500">
            By activating, you agree to make your profile visible to college coaches.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
