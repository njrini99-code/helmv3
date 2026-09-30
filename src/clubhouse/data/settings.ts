import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { GolfSessionProfile } from '@/lib/auth/session';
import { getNotificationPreferences } from '@/app/actions/notification-preferences';
import { getOrCreateTeamCoachHelmSettings, getTeamCoachHelmAccess } from '@/app/golf/actions/insights';
import { getPlayerJoinRequests } from '@/app/golf/actions/teams';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { dbToTs, type PhilosophyDbRow } from '@/lib/coachhelm/philosophy-map';
import { resolveEventReminderSettings } from '@/lib/golf/event-reminder-settings';
import type { PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import { chLogServer } from '../lib/track-server';
import type { ChCoachHelmSettings, ChScoring, ChSettingsData } from '../screens/settings/model';

/**
 * Settings (Clubhouse). Every read the page needs, in one server pass, each
 * with its own error flag. Reads the same tables the current Settings page
 * reads. The only write is the existing team CoachHelm row create, and only
 * for the head coach (the one role RLS lets create it); every other default
 * row is created on the first save instead.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

const ok = <T,>(value: T) => ({ value, error: false as const });
const failed = { value: null, error: true as const };

function log(read: string, error: unknown, area = 'settings') {
  chLogServer('settings', read, error, area);
}

const str = (v: unknown) => (v == null ? '' : String(v));

export async function loadSettings(session: GolfSessionProfile, teamId: string | null): Promise<ChSettingsData> {
  const supabase = await createClient();
  const role: 'coach' | 'player' = session.coach ? 'coach' : 'player';
  const coachId = session.coach?.id ?? null;
  const playerId = session.player?.id ?? null;

  const [userRes, deliveryRes, profileRes, teamNameRes] = await Promise.all([
    supabase.auth.getUser(),
    getNotificationPreferences().catch((e: unknown) => ({ data: null, error: String(e) })),
    role === 'coach'
      ? supabase.from('golf_coaches').select('full_name, avatar_url').eq('id', coachId!).maybeSingle()
      : supabase
          .from('golf_players')
          .select('first_name, last_name, avatar_url, handicap, handicap_index, graduation_year, hometown, state, phone')
          .eq('id', playerId!)
          .maybeSingle(),
    teamId ? supabase.from('golf_teams').select('name').eq('id', teamId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (userRes.error) log('user', userRes.error, 'auth');
  if (deliveryRes.error || !deliveryRes.data) log('deliveryPrefs', deliveryRes.error ?? 'no data', 'notifications');
  if (profileRes.error) log('profile', profileRes.error);
  else if (!profileRes.data) log('profile', 'no profile row');
  if (teamNameRes.error) log('teamName', teamNameRes.error, 'teams');

  const p = profileRes.error ? null : (profileRes.data as Record<string, unknown> | null);
  const profile =
    p == null
      ? failed
      : ok({
          firstName: str(p.first_name),
          lastName: str(p.last_name),
          fullName: role === 'coach' ? str(p.full_name) : [p.first_name, p.last_name].filter(Boolean).join(' '),
          avatarUrl: (p.avatar_url as string | null) ?? null,
        });

  const base: ChSettingsData = {
    role,
    userId: session.userId,
    email: userRes.data.user?.email ?? null,
    coachId,
    playerId,
    teamId,
    teamName: teamNameRes.data?.name ?? null,
    profile,
    delivery: deliveryRes.error || !deliveryRes.data ? failed : ok(deliveryRes.data as Record<string, boolean>),
    playerRouting: null,
    digest: null,
    scoring: null,
    reminders: null,
    team: null,
    joinCode: null,
    golf: null,
    membership: null,
    coachhelm: null,
  };

  if (role === 'player') {
    base.golf =
      p == null
        ? failed
        : ok({
            handicap: str(p.handicap),
            handicapIndex: str(p.handicap_index),
            graduationYear: str(p.graduation_year),
            hometown: str(p.hometown),
            state: str(p.state),
            phone: str(p.phone),
          });
    const [routingRes, requestsRes, teamRes] = await Promise.all([
      supabase.from('golf_player_notification_state').select('prefs, quiet_mode').eq('player_id', playerId!).maybeSingle(),
      getPlayerJoinRequests(playerId!).catch((e: unknown) => ({ success: false as const, error: String(e), data: undefined })),
      teamId
        ? supabase.from('golf_teams').select('id, name, organization:organizations(name)').eq('id', teamId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (routingRes.error) log('playerRouting', routingRes.error, 'notifications');
    base.playerRouting = routingRes.error
      ? failed
      : ok({ prefs: (routingRes.data?.prefs as PrefsByCategory | null) ?? {}, quiet: routingRes.data?.quiet_mode ?? false });
    if (!requestsRes.success) log('joinRequests', requestsRes.error, 'teams');
    if (teamRes.error) log('membershipTeam', teamRes.error, 'teams');
    const t = teamRes.data as { id: string; name: string; organization: { name: string } | null } | null;
    base.membership =
      !requestsRes.success || teamRes.error
        ? failed
        : ok({
            team: t ? { id: t.id, name: t.name, orgName: t.organization?.name ?? null } : null,
            requests: (requestsRes.data ?? [])
              .filter((r) => r.status === 'pending')
              .map((r) => ({ id: r.id, teamName: r.team?.name ?? 'A team', createdAt: r.created_at })),
          });
    return base;
  }

  // ── Coach ──
  const [digestRes, settingsRes, teamRes, chCoachRes, philosophyRes] = await Promise.all([
    supabase.from('golf_coach_philosophy').select('email_digest_enabled').eq('coach_id', coachId!).maybeSingle(),
    teamId
      ? supabase
          .from('golf_team_settings')
          .select('scoring_format, handicap_system, default_tees, timezone, event_reminders_enabled, event_reminder_early_hours, event_reminder_late_minutes')
          .eq('team_id', teamId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    teamId
      ? supabase
          .from('golf_teams')
          .select('id, name, season, join_code, organization_id, organization:organizations(id, name, location_city, location_state, division, conference)')
          .eq('id', teamId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('golf_coachhelm_settings').select('enabled, auto_insights, weekly_summary, trend_alerts').eq('coach_id', coachId!).maybeSingle(),
    supabase.from('golf_coach_philosophy').select('*').eq('coach_id', coachId!).maybeSingle(),
  ]);

  if (digestRes.error) log('digest', digestRes.error, 'notifications');
  // A missing row or null means the digest is on, as the current app reads it.
  base.digest = digestRes.error ? failed : ok(digestRes.data?.email_digest_enabled !== false);

  if (teamId) {
    if (settingsRes.error) log('teamSettings', settingsRes.error, 'teams');
    const s = settingsRes.data;
    const scoring: ChScoring = {
      scoringFormat: s?.scoring_format === 'match_play' ? 'match_play' : 'stroke_play',
      handicapSystem: s?.handicap_system === 'world' || s?.handicap_system === 'none' ? s.handicap_system : 'usga',
      defaultTees: (['black', 'blue', 'white', 'gold'] as const).find((t) => t === s?.default_tees) ?? 'blue',
      timezone: s?.timezone || 'America/New_York',
    };
    base.scoring = settingsRes.error ? failed : ok(scoring);
    const r = resolveEventReminderSettings(s ?? null);
    base.reminders = settingsRes.error ? failed : ok({ enabled: r.enabled, earlyHours: r.earlyHours, lateMinutes: r.lateMinutes });

    if (teamRes.error) log('team', teamRes.error, 'teams');
    else if (!teamRes.data) log('team', 'no team row', 'teams');
    type OrgRow = { id: string; name: string | null; location_city: string | null; location_state: string | null; division: string | null; conference: string | null };
    const t = teamRes.data as { id: string; name: string; season: string | null; join_code: string | null; organization: OrgRow | null } | null;
    base.team =
      teamRes.error || !t
        ? failed
        : ok({
            id: t.id,
            name: t.name,
            season: t.season ?? '',
            org: t.organization
              ? {
                  id: t.organization.id,
                  name: str(t.organization.name),
                  city: str(t.organization.location_city),
                  state: str(t.organization.location_state),
                  division: str(t.organization.division),
                  conference: str(t.organization.conference),
                }
              : null,
          });
    base.joinCode = teamRes.error || !t?.join_code ? failed : ok(t.join_code);
  }

  base.coachhelm = await loadCoachHelm(supabase, teamId, chCoachRes, philosophyRes, coachId!);
  return base;
}

async function loadCoachHelm(
  _supabase: Supabase,
  teamId: string | null,
  chCoachRes: { data: { enabled: boolean | null; auto_insights: boolean | null; weekly_summary: boolean | null; trend_alerts: boolean | null } | null; error: unknown },
  philosophyRes: { data: unknown; error: unknown },
  coachId: string,
): Promise<ChSettingsData['coachhelm']> {
  if (chCoachRes.error) log('coachhelmCoach', chCoachRes.error, 'coachhelm_ai');
  if (philosophyRes.error) log('philosophy', philosophyRes.error, 'coachhelm_ai');
  if (chCoachRes.error || philosophyRes.error) return failed;

  let team: ChCoachHelmSettings['team'] = null;
  if (teamId) {
    // These team actions throw where the loader's other reads return an error; a throw here must not
    // take the whole page down (82101), so it is logged and the team switch is left out, as a failed read is.
    try {
      const access = await getTeamCoachHelmAccess(teamId);
      // A failed check is not "an assistant": that would tell a head coach only the head coach may change this (80804).
      if (!access.success) log('teamCoachhelmAccess', access.error ?? 'unknown', 'coachhelm_ai');
      else if (access.isHeadCoach) {
        // The head coach may create the team row on first read, as the current page does.
        const settings = await getOrCreateTeamCoachHelmSettings(teamId);
        if (!settings.success || !settings.settings) log('teamCoachhelm', settings.error ?? 'no settings', 'coachhelm_ai');
        else team = { enabled: settings.settings.enabled, disabledAt: settings.settings.disabled_at, isHeadCoach: true };
      } else {
        // Assistants only read; with no row yet, CoachHelm is on for the team (the default).
        const { data, error } = await _supabase.from('golf_team_coachhelm_settings').select('enabled, disabled_at').eq('team_id', teamId).maybeSingle();
        if (error) log('teamCoachhelm', error, 'coachhelm_ai');
        else team = { enabled: data?.enabled ?? true, disabledAt: data?.disabled_at ?? null, isHeadCoach: false };
      }
    } catch (err) {
      log('teamCoachhelm', err, 'coachhelm_ai');
    }
  }

  const c = chCoachRes.data;
  const row = philosophyRes.data as PhilosophyDbRow | null;
  const now = new Date().toISOString();
  const philosophy = (row
    ? dbToTs(row)
    : {
        ...(PHILOSOPHY_DEFAULTS as unknown as CoachPhilosophy),
        id: null,
        coachId,
        alertScoringDecline: true,
        alertStatRegression: true,
        alertTournamentPressure: true,
        alertPlateau: false,
        alertBubblePlayer: true,
        alertSurgePlayer: true,
        alertStreaks: true,
        alertRecurringWeakness: true,
        alertClosingHoles: false,
        alertPar3Issues: false,
        showStrokesGained: true,
        showAdvancedStats: true,
        insightVerbosity: 'brief',
        createdAt: now,
        updatedAt: now,
      }) as CoachPhilosophy & { id: string | null };
  return ok({
    coach: {
      enabled: c?.enabled ?? true,
      showInsights: c?.auto_insights ?? true,
      showPredictions: c?.weekly_summary ?? true,
      showPatterns: c?.trend_alerts ?? true,
    },
    team,
    philosophy,
  });
}
