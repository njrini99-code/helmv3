import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import type { ChPendingCoach, ChSettingsData, ChStaffMember } from '../screens/settings/model';

/** Settings sample data (the handoff's people), shared by the preview and the Settings tests. */
const phil = {
  ...(PHILOSOPHY_DEFAULTS as unknown as CoachPhilosophy),
  id: 'ph1',
  coachId: 'maya',
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
  insightVerbosity: 'brief' as const,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
};

const ok = <T,>(value: T) => ({ value, error: false as const });

/** Team, coach: the staff the preview and the tests share (the viewer, `maya`, is the head coach). */
export const PREVIEW_STAFF: ChStaffMember[] = [
  { coachId: 'maya', fullName: 'Maya Reyes', title: 'Head Coach', role: 'head_coach' },
  { coachId: 'dan', fullName: 'Dan Whitfield', title: 'Director of Golf', role: 'assistant_coach' },
];
/** The same team seen by an assistant: the viewer is `maya` again, no longer the head. */
export const PREVIEW_STAFF_AS_ASSISTANT: ChStaffMember[] = [
  { coachId: 'ines', fullName: 'Ines Cho', title: null, role: 'head_coach' },
  { coachId: 'maya', fullName: 'Maya Reyes', title: null, role: 'assistant_coach' },
];
export const PREVIEW_PENDING_COACHES: ChPendingCoach[] = [{ coachId: 'avery', fullName: 'Avery Lee', email: 'avery@unc.edu' }];
export const failedRead = { value: null, error: true as const };

const DELIVERY = {
  email_messages: true,
  email_event_reminders: true,
  email_announcements: true,
  email_task_reminders: true,
  email_coachhelm: true,
  push_messages: true,
  push_events: false,
  push_announcements: true,
  push_task_reminders: true,
  push_coachhelm: false,
  quiet_mode: false,
};

export function coachData(): ChSettingsData {
  return {
    role: 'coach',
    userId: 'u-maya',
    email: 'maya.reyes@unc.edu',
    coachId: 'maya',
    playerId: null,
    teamId: 'preview-team',
    teamName: 'Varsity',
    profile: ok({ firstName: 'Maya', lastName: 'Reyes', fullName: 'Maya Reyes', avatarUrl: null }),
    delivery: ok(DELIVERY),
    playerRouting: null,
    digest: ok(true),
    scoring: ok({ scoringFormat: 'stroke_play', handicapSystem: 'usga', defaultTees: 'blue', timezone: 'America/New_York' }),
    reminders: ok({ enabled: true, earlyHours: 24, lateMinutes: 60 }),
    team: ok({ id: 'preview-team', name: 'Varsity', season: '2026–27', org: { id: 'org', name: 'University of North Carolina', city: 'Chapel Hill', state: 'NC', division: 'NCAA D1', conference: 'ACC' } }),
    joinCode: ok('K7M2Q9XA'),
    golf: null,
    membership: null,
    coachhelm: ok({ coach: { enabled: true, showInsights: true, showPredictions: true, showPatterns: true }, team: { enabled: true, disabledAt: null, isHeadCoach: true }, philosophy: phil }),
  };
}

export function playerData(onTeam: boolean, withRequest = !onTeam): ChSettingsData {
  return {
    role: 'player',
    userId: 'u-jonah',
    email: 'jonah.okafor@unc.edu',
    coachId: null,
    playerId: 'jonah',
    teamId: onTeam ? 'preview-team' : null,
    teamName: onTeam ? 'Varsity' : null,
    profile: ok({ firstName: 'Jonah', lastName: 'Okafor', fullName: 'Jonah Okafor', avatarUrl: null }),
    delivery: ok(DELIVERY),
    playerRouting: ok({ prefs: { round_review_ready: { push: true, email: false, in_app: true }, coach_assigned_goal: { push: true, email: true, in_app: true } }, quiet: false }),
    digest: null,
    scoring: null,
    reminders: null,
    team: null,
    joinCode: null,
    golf: ok({ handicap: '2.4', handicapIndex: '2.1', graduationYear: '2029', hometown: 'Charlotte', state: 'NC', phone: '' }),
    membership: ok({
      team: onTeam ? { id: 'preview-team', name: 'Varsity', orgName: 'University of North Carolina' } : null,
      requests: withRequest ? [{ id: 'rq1', teamName: 'Wake Forest Golf', createdAt: '2026-10-12T15:00:00Z' }] : [],
    }),
    coachhelm: null,
  };
}
