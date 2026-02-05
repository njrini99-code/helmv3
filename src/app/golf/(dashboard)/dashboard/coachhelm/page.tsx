import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GlassCard } from '@/components/ui/glass-card';
import { IconInfo, IconSparkles } from '@/components/icons';
import { getPlayerCoachHelmDashboard } from '@/app/golf/actions/insights';
import { getPlayerShotAnalytics } from '@/app/golf/actions/shot-analytics';
import { PlayerCoachHelmDashboard } from './components/PlayerCoachHelmDashboard';

/**
 * Error state component for displaying errors gracefully
 */
function ErrorState({ error }: { error: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6 bg-gradient-to-br from-red-500/5 via-transparent to-transparent">
      <GlassCard className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
          <IconInfo size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Unable to Load AI Dashboard
        </h2>
        <p className="text-warm-600 mb-6">{error}</p>
        <a
          href="/golf/dashboard/coachhelm"
          className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Try Again
        </a>
      </GlassCard>
    </div>
  );
}

/**
 * Not a player error state - shown when user is a coach or has no player profile
 */
function NotPlayerState() {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <GlassCard className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <IconSparkles size={32} className="text-amber-500" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          Player Dashboard Only
        </h2>
        <p className="text-warm-600 mb-6">
          This CoachHelm dashboard is designed for players. As a coach, you can access
          player insights from the roster page.
        </p>
        <a
          href="/golf/dashboard"
          className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Go to Dashboard
        </a>
      </GlassCard>
    </div>
  );
}

/**
 * CoachHelm disabled state
 */
function CoachHelmDisabledState({ reason }: { reason: string }) {
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <GlassCard className="max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          <IconSparkles size={32} className="text-slate-400" />
        </div>
        <h2 className="text-xl font-semibold text-warm-900 mb-2">
          CoachHelm AI Not Available
        </h2>
        <p className="text-warm-600 mb-6">
          {reason || 'CoachHelm is currently disabled for your team. Contact your coach for more information.'}
        </p>
        <a
          href="/golf/dashboard"
          className="inline-block px-4 py-2 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors"
        >
          Return to Dashboard
        </a>
      </GlassCard>
    </div>
  );
}

/**
 * Player CoachHelm Dashboard Page
 *
 * Server component that:
 * 1. Authenticates the user
 * 2. Fetches player record
 * 3. Fetches CoachHelm dashboard data
 * 4. Renders the client dashboard component
 */
export default async function PlayerCoachHelmPage() {
  const supabase = await createClient();

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/golf/login');
  }

  // Get player record - this is a player-only page
  const { data: player, error: playerError } = await supabase
    .from('golf_players')
    .select('id, first_name, last_name')
    .eq('user_id', user.id)
    .single();

  if (playerError || !player) {
    // Check if user is a coach
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (coach) {
      // User is a coach, not a player
      return <NotPlayerState />;
    }

    // No player or coach record found
    return <ErrorState error="Player profile not found. Please complete onboarding first." />;
  }

  // Fetch CoachHelm dashboard data and shot analytics in parallel
  const [dashboardResult, analyticsResult] = await Promise.all([
    getPlayerCoachHelmDashboard(player.id),
    getPlayerShotAnalytics(player.id, 30),
  ]);

  // Handle CoachHelm disabled or other errors
  if (!dashboardResult.success) {
    const error = dashboardResult.error || 'Failed to load AI dashboard';

    // Check if CoachHelm is disabled using explicit error code (more reliable than string matching)
    if (dashboardResult.errorCode === 'COACHHELM_DISABLED') {
      return <CoachHelmDisabledState reason={error} />;
    }

    return <ErrorState error={error} />;
  }

  if (!dashboardResult.data) {
    return <ErrorState error="No dashboard data available" />;
  }

  // Render the dashboard
  return (
    <PlayerCoachHelmDashboard
      data={dashboardResult.data}
      playerId={player.id}
      initialShotAnalytics={analyticsResult.success ? analyticsResult.data : null}
    />
  );
}
