'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageLoading } from '@/components/ui/loading';
import { IconTarget, IconUsers, IconChart, IconCheck, IconEye, IconLock } from '@/components/icons';
import { useAuth } from '@/hooks/use-auth';
import { activateRecruitingExposure } from '@/app/baseball/actions/player-access';

export default function ActivateRecruitingPage() {
  const { user, player, loading: authLoading, updatePlayer } = useAuth();
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (authLoading) return <PageLoading />;

  if (user?.role !== 'player') {
    router.push('/baseball/dashboard/command-center');
    return null;
  }

  if (player?.player_type === 'college') {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <Card variant="glass" className="border border-warm-200">
          <CardContent className="p-12 text-center">
            <div className="w-14 h-14 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconLock size={28} className="text-warm-400" />
            </div>
            <h3 className="text-lg font-semibold text-warm-900 mb-2">Not available for college players</h3>
            <p className="text-sm leading-relaxed text-warm-500 max-w-xs mx-auto">
              Recruiting activation is for high school, JUCO, and showcase players only.
              As a college player, your team features are available from the main dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (player?.recruiting_activated) {
    router.push('/baseball/player/today');
    return null;
  }

  const handleActivate = async () => {
    if (!player?.id) {
      setError('Player not found');
      return;
    }

    setActivating(true);
    setError(null);

    try {
      // Go through the gated server action so the team's
      // recruiting_exposure_enabled toggle is enforced. The old raw client-side
      // update bypassed it — a program with exposure disabled could still be
      // activated from this page if RLS permitted the write.
      await activateRecruitingExposure();

      // Update local state
      await updatePlayer?.({
        recruiting_activated: true,
        recruiting_activated_at: new Date().toISOString(),
      });

      router.push('/baseball/player/today');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred. Please try again.');
      setActivating(false);
    }
  };

  return (
    <>
      <Header
        title="Activate Recruiting"
        subtitle="Get discovered by college coaches"
      />
      <div className="p-6 lg:p-8 max-w-[720px] mx-auto">
        {/* Hero Section */}
        <Card variant="glass" className="mb-6 bg-gradient-to-br from-primary-50 to-white border-primary-200">
          <CardContent className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center mx-auto mb-4">
              <IconTarget size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-warm-900 mb-3">
              Ready to be recruited?
            </h2>
            <p className="text-warm-600 max-w-2xl mx-auto mb-6">
              Activate recruiting to make your profile visible to college coaches and unlock powerful features
              to help you get recruited to play at the next level.
            </p>
            <Badge variant="success" className="text-base px-4 py-2">
              Free to activate • No credit card required
            </Badge>
          </CardContent>
        </Card>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card variant="glass">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <IconEye size={24} className="text-blue-600" />
              </div>
              <h3 className="font-semibold text-warm-900">Get Discovered</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-warm-600 mb-3">
                Make your profile visible in coach searches and recommendations.
              </p>
              <ul className="space-y-2 text-sm text-warm-600">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Appear in coach discovery searches</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Get matched with relevant programs</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>See who's viewing your profile</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-3">
                <IconUsers size={24} className="text-purple-600" />
              </div>
              <h3 className="font-semibold text-warm-900">Connect with Coaches</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-warm-600 mb-3">
                See which coaches are interested and message them directly.
              </p>
              <ul className="space-y-2 text-sm text-warm-600">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Know which coaches viewed you</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Track watchlist additions</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Direct messaging with coaches</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center mb-3">
                <IconTarget size={24} className="text-primary-600" />
              </div>
              <h3 className="font-semibold text-warm-900">Manage Your Journey</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-warm-600 mb-3">
                Track your recruiting progress and manage your college list.
              </p>
              <ul className="space-y-2 text-sm text-warm-600">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Timeline of recruiting activity</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Track offers and commitments</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Organize your target schools</span>
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mb-3">
                <IconChart size={24} className="text-amber-600" />
              </div>
              <h3 className="font-semibold text-warm-900">Track Analytics</h3>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-warm-600 mb-3">
                Understand your recruiting reach and optimize your profile.
              </p>
              <ul className="space-y-2 text-sm text-warm-600">
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Profile view statistics</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Video engagement metrics</span>
                </li>
                <li className="flex items-start gap-2">
                  <IconCheck size={16} className="text-primary-600 mt-0.5 flex-shrink-0" />
                  <span>Interest by program type</span>
                </li>
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Privacy & Control */}
        <Card className="mb-6">
          <CardHeader>
            <h3 className="font-semibold text-warm-900">You're in control</h3>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-warm-600">
              <div>
                <h4 className="font-medium text-warm-900 mb-2">Privacy Settings</h4>
                <ul className="space-y-2">
                  <li>• Control what information is visible</li>
                  <li>• Choose who can contact you</li>
                  <li>• Deactivate recruiting anytime</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium text-warm-900 mb-2">Your Data</h4>
                <ul className="space-y-2">
                  <li>• Your profile belongs to you</li>
                  <li>• Export your data anytime</li>
                  <li>• Delete your account anytime</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        <Card variant="glass">
          <CardContent className="p-8 text-center">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-6">
                {error}
              </div>
            )}
            <Button
              size="lg"
              onClick={handleActivate}
              isLoading={activating}
              className="px-8"
            >
              Activate Recruiting
            </Button>
            <p className="text-sm leading-relaxed text-warm-500 mt-4">
              By activating, you agree to make your profile visible to college coaches
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
