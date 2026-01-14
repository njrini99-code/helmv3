'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AdminCommandCenterClient } from '@/components/admin/command-center/AdminCommandCenterClient';
import type { AdminCommandCenterMetrics } from '@/components/admin/command-center/types';

const DEFAULT_PIPELINE_STAGES: Record<string, number> = {
  watchlist: 0,
  high_priority: 0,
  contacted: 0,
  campus_visit: 0,
  offer_extended: 0,
  committed: 0,
  uninterested: 0,
};

const DEFAULT_GAPS: AdminCommandCenterMetrics['gaps'] = [
  {
    label: 'Billing + MRR',
    source: 'Stripe, Paddle, or RevenueCat webhooks',
    note: 'Capture subscription events to compute MRR, churn, and LTV by segment.',
  },
  {
    label: 'Session Analytics',
    source: 'PostHog, Segment, or custom event pipeline',
    note: 'Track session length, retention cohorts, and feature stickiness.',
  },
  {
    label: 'Support Inbox',
    source: 'Intercom, Zendesk, or shared support mailbox',
    note: 'Tag tickets by theme and severity to identify recurring UX issues.',
  },
  {
    label: 'Outcome Tracking',
    source: 'Recruiting outcomes + golf season completion events',
    note: 'Log commitments, offers, and season completions to prove ROI.',
  },
];

const EMPTY_METRICS: AdminCommandCenterMetrics = {
  updatedAt: new Date().toISOString(),
  status: { connected: false, warnings: ['Supabase service role key not configured'] },
  totals: {
    users: 0,
    admins: 0,
    newUsers30d: 0,
    baseball: { players: 0, coaches: 0 },
    golf: { players: 0, coaches: 0 },
  },
  activity: {
    activeSenders7d: 0,
    activeSenders30d: 0,
    baseballActive7d: 0,
    golfActive7d: 0,
    messages7d: 0,
    conversations30d: 0,
  },
  onboarding: {
    baseball: {
      playersTotal: 0,
      playersCompleted: 0,
      playersProfileComplete: 0,
      coachesTotal: 0,
      coachesCompleted: 0,
    },
    golf: {
      playersTotal: 0,
      playersCompleted: 0,
      playersProfileComplete: 0,
      coachesTotal: 0,
      coachesCompleted: 0,
    },
  },
  baseball: {
    watchlistStages: { ...DEFAULT_PIPELINE_STAGES },
    recruitingActivePlayers: 0,
    commitments: 0,
    videos30d: 0,
    engagementEvents30d: 0,
  },
  golf: {
    rounds30d: 0,
    events30d: 0,
    activePlayers30d: 0,
  },
  demos: {
    total: 0,
    new30d: 0,
  },
  auth: {
    failedLogins7d: 0,
    lockedAccounts: 0,
  },
  geography: {
    topStates: [],
  },
  gaps: DEFAULT_GAPS,
};

function getAdminAllowlist() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function getAdminMetrics(): Promise<AdminCommandCenterMetrics> {
  const warnings: string[] = [];
  let admin;

  try {
    admin = createAdminClient();
  } catch {
    return EMPTY_METRICS;
  }

  const now = new Date();
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  async function safeCount(label: string, promise: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
    const { count, error } = await promise;
    if (error) warnings.push(label);
    return count ?? 0;
  }

  const [
    usersTotal,
    usersAdmins,
    baseballPlayersTotal,
    baseballPlayersCompleted,
    baseballPlayersProfileComplete,
    baseballCoachesTotal,
    baseballCoachesCompleted,
    golfPlayersTotal,
    golfPlayersCompleted,
    golfPlayersProfileComplete,
    golfCoachesTotal,
    golfCoachesCompleted,
    recruitingActivePlayers,
    commitments,
    videos30d,
    engagementEvents30d,
    golfEvents30d,
    demoRequestsTotal,
    demoRequests30d,
    failedLogins7d,
    lockedAccounts,
    conversations30d,
    messages7d,
    baseballPlayersNew30d,
    golfPlayersNew30d,
  ] = await Promise.all([
    safeCount('users total', admin.from('users').select('id', { count: 'exact', head: true })),
    safeCount('users admins', admin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin')),
    // Baseball counts from the actual players/coaches tables
    safeCount('baseball players total', admin.from('players').select('id', { count: 'exact', head: true })),
    safeCount('baseball players onboarding', admin.from('players').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true)),
    safeCount('baseball players profile', admin.from('players').select('id', { count: 'exact', head: true }).eq('profile_complete', true)),
    safeCount('baseball coaches total', admin.from('coaches').select('id', { count: 'exact', head: true })),
    safeCount('baseball coaches onboarding', admin.from('coaches').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true)),
    // Golf counts from the actual golf_players/golf_coaches tables
    safeCount('golf players total', admin.from('golf_players').select('id', { count: 'exact', head: true })),
    safeCount('golf players onboarding', admin.from('golf_players').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true)),
    safeCount('golf players profile', admin.from('golf_players').select('id', { count: 'exact', head: true }).eq('profile_complete', true)),
    safeCount('golf coaches total', admin.from('golf_coaches').select('id', { count: 'exact', head: true })),
    safeCount('golf coaches onboarding', admin.from('golf_coaches').select('id', { count: 'exact', head: true }).eq('onboarding_completed', true)),
    // Recruiting stats
    safeCount('recruiting active players', admin.from('players').select('id', { count: 'exact', head: true }).eq('recruiting_activated', true)),
    safeCount('commitments', admin.from('players').select('id', { count: 'exact', head: true }).not('commitment_date', 'is', null)),
    // Activity counts
    safeCount('videos 30d', admin.from('videos').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
    safeCount('engagement events 30d', admin.from('player_engagement_events').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
    safeCount('golf events 30d', admin.from('golf_events').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
    // Demo requests
    safeCount('demo requests total', admin.from('demo_requests').select('id', { count: 'exact', head: true })),
    safeCount('demo requests 30d', admin.from('demo_requests').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
    // Auth
    safeCount('failed logins 7d', admin.from('login_attempts').select('id', { count: 'exact', head: true }).gte('last_attempt', since7d).gt('failed_attempts', 0)),
    safeCount('locked accounts', admin.from('login_attempts').select('id', { count: 'exact', head: true }).gte('locked_until', now.toISOString())),
    // Messages
    safeCount('conversations 30d', admin.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
    safeCount('messages 7d', admin.from('messages').select('id', { count: 'exact', head: true }).gte('sent_at', since7d)),
    // New signups by sport (30d)
    safeCount('baseball players new 30d', admin.from('players').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
    safeCount('golf players new 30d', admin.from('golf_players').select('id', { count: 'exact', head: true }).gte('created_at', since30d)),
  ]);

  const { data: watchlistStagesData, error: watchlistStagesError } = await admin
    .from('watchlists')
    .select('pipeline_stage')
    .gte('updated_at', since30d);
  if (watchlistStagesError) warnings.push('watchlist stages');

  const watchlistStages = { ...DEFAULT_PIPELINE_STAGES };
  (watchlistStagesData || []).forEach((row) => {
    const stage = row.pipeline_stage || 'watchlist';
    watchlistStages[stage] = (watchlistStages[stage] || 0) + 1;
  });

  const { data: messageSenders7d, error: messageSenders7dError } = await admin
    .from('messages')
    .select('sender_id, sender:users!messages_sender_id_fkey(role, sport)')
    .gte('sent_at', since7d);
  if (messageSenders7dError) warnings.push('message senders 7d');

  const { data: messageSenders30d, error: messageSenders30dError } = await admin
    .from('messages')
    .select('sender_id, sender:users!messages_sender_id_fkey(role, sport)')
    .gte('sent_at', since30d);
  if (messageSenders30dError) warnings.push('message senders 30d');

  const activeSenders7dSet = new Set<string>();
  const activeSenders30dSet = new Set<string>();
  const baseballActiveSet = new Set<string>();
  const golfActiveSet = new Set<string>();

  (messageSenders7d || []).forEach((row) => {
    if (!row.sender_id) return;
    activeSenders7dSet.add(row.sender_id);
    const sender = row.sender as { role?: string | null; sport?: string | null } | null;
    if (sender?.sport === 'baseball') baseballActiveSet.add(row.sender_id);
    if (sender?.sport === 'golf') golfActiveSet.add(row.sender_id);
  });

  (messageSenders30d || []).forEach((row) => {
    if (!row.sender_id) return;
    activeSenders30dSet.add(row.sender_id);
  });

  const { data: golfRounds30dData, error: golfRoundsError } = await admin
    .from('golf_rounds')
    .select('id, player_id')
    .gte('created_at', since30d);
  if (golfRoundsError) warnings.push('golf rounds 30d');

  const golfRounds30d = golfRounds30dData?.length ?? 0;
  const activeGolfPlayers30d = new Set(
    (golfRounds30dData || []).map((row) => row.player_id)
  ).size;

  const { data: stateSamples, error: stateSampleError } = await admin
    .from('players')
    .select('state')
    .not('state', 'is', null)
    .limit(2500);
  if (stateSampleError) warnings.push('player states sample');

  const { data: golfStateSamples, error: golfStateSampleError } = await admin
    .from('golf_players')
    .select('state')
    .not('state', 'is', null)
    .limit(2500);
  if (golfStateSampleError) warnings.push('golf states sample');

  const stateCounts = new Map<string, number>();
  [...(stateSamples || []), ...(golfStateSamples || [])].forEach((row) => {
    const state = row.state ? row.state.toUpperCase().trim() : '';
    if (!state) return;
    stateCounts.set(state, (stateCounts.get(state) || 0) + 1);
  });

  const topStates = Array.from(stateCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([state, count]) => ({ state, count }));

  return {
    updatedAt: now.toISOString(),
    status: {
      connected: true,
      warnings,
    },
    totals: {
      users: usersTotal,
      admins: usersAdmins,
      newUsers30d: baseballPlayersNew30d + golfPlayersNew30d, // Combined new signups
      baseball: { players: baseballPlayersTotal, coaches: baseballCoachesTotal },
      golf: { players: golfPlayersTotal, coaches: golfCoachesTotal },
    },
    activity: {
      activeSenders7d: activeSenders7dSet.size,
      activeSenders30d: activeSenders30dSet.size,
      baseballActive7d: baseballActiveSet.size,
      golfActive7d: golfActiveSet.size,
      messages7d,
      conversations30d,
    },
    onboarding: {
      baseball: {
        playersTotal: baseballPlayersTotal,
        playersCompleted: baseballPlayersCompleted,
        playersProfileComplete: baseballPlayersProfileComplete,
        coachesTotal: baseballCoachesTotal,
        coachesCompleted: baseballCoachesCompleted,
      },
      golf: {
        playersTotal: golfPlayersTotal,
        playersCompleted: golfPlayersCompleted,
        playersProfileComplete: golfPlayersProfileComplete,
        coachesTotal: golfCoachesTotal,
        coachesCompleted: golfCoachesCompleted,
      },
    },
    baseball: {
      watchlistStages,
      recruitingActivePlayers,
      commitments,
      videos30d,
      engagementEvents30d,
    },
    golf: {
      rounds30d: golfRounds30d,
      events30d: golfEvents30d,
      activePlayers30d: activeGolfPlayers30d,
    },
    demos: {
      total: demoRequestsTotal,
      new30d: demoRequests30d,
    },
    auth: {
      failedLogins7d,
      lockedAccounts,
    },
    geography: {
      topStates,
    },
    gaps: DEFAULT_GAPS,
  };
}

export default async function AdminCommandCenterPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect('/baseball/login');
  }

  const { data: userProfile } = await supabase
    .from('users')
    .select('role, sport')
    .eq('id', user.id)
    .single();

  const allowlist = getAdminAllowlist();
  const isAdmin =
    userProfile?.role === 'admin' ||
    (!!user.email && allowlist.includes(user.email.toLowerCase()));

  if (!isAdmin) {
    if (userProfile?.sport === 'golf') {
      redirect('/golf/dashboard');
    }
    redirect('/baseball/dashboard');
  }

  const metrics = await getAdminMetrics();

  return (
    <AdminCommandCenterClient metrics={metrics} adminEmail={user.email} />
  );
}
