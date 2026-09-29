'use client';

import { useMemo } from 'react';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import type { CoachPhilosophy } from '@/lib/coachhelm/types';
import type { ChDevice, ChResult, ChSettingsData, ChSettingsSection, ChSettingsWrites } from '../screens/settings/model';
import { SettingsView } from '../screens/settings/SettingsView';

/**
 * Settings with the handoff's people and fake writes, for the dev preview.
 *   ?state= player | noteam | failed | partial | assistant | failwrites
 *   &section= account | notifications | team | golf | coachhelm | preferences
 */
const wait = <T,>(v: T, ms = 450) => new Promise<T>((r) => setTimeout(() => r(v), ms));

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
const failed = { value: null, error: true as const };

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

function coachData(): ChSettingsData {
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

function playerData(onTeam: boolean): ChSettingsData {
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
      requests: onTeam ? [] : [{ id: 'rq1', teamName: 'Wake Forest Golf', createdAt: '2026-10-12T15:00:00Z' }],
    }),
    coachhelm: null,
  };
}

export function PreviewSettings({ state, section }: { state?: string; section?: string }) {
  const data = useMemo<ChSettingsData>(() => {
    if (state === 'player') return playerData(true);
    if (state === 'noteam') return playerData(false);
    const d = coachData();
    if (state === 'failed') return { ...d, profile: failed, delivery: failed, digest: failed, scoring: failed, reminders: failed, team: failed, joinCode: failed, coachhelm: failed };
    if (state === 'partial') return { ...d, delivery: failed, reminders: failed, digest: failed };
    if (state === 'assistant') {
      const ch = d.coachhelm && !d.coachhelm.error ? d.coachhelm.value : null;
      return { ...d, coachhelm: ch ? ok({ ...ch, team: { enabled: true, disabledAt: null, isHeadCoach: false } }) : d.coachhelm };
    }
    return d;
  }, [state]);

  const writes = useMemo<ChSettingsWrites>(() => {
    const r = (): Promise<ChResult> => wait(state === 'failwrites' ? { success: false, error: 'preview' } : { success: true });
    return {
      saveProfile: r,
      uploadAvatar: () => wait({ success: false, error: 'Uploads are off in the preview.' }),
      changeEmail: r,
      changePassword: r,
      setDelivery: r,
      setDigest: r,
      setRoutingCell: r,
      setRoutingAll: r,
      setRoutingQuiet: r,
      saveScoring: r,
      saveReminders: r,
      saveTeam: r,
      regenerateCode: () => wait(state === 'failwrites' ? { success: false } : { success: true, data: { joinCode: 'R4T8W2PL' } }),
      saveGolf: r,
      leaveTeam: r,
      requestJoin: r,
      cancelRequest: r,
      setCoachHelmCoach: r,
      setCoachHelmTeam: r,
      savePhilosophy: (id) => wait(state === 'failwrites' ? { success: false } : { success: true, data: { id: id ?? 'ph1' } }),
      deleteAccount: r,
      signOut: async () => {},
      cleanupAfterDelete: async () => {},
      refresh: () => {},
    };
  }, [state]);

  const device: ChDevice = {
    native: true,
    push: { status: 'unsubscribed', pending: false, subscribe: () => wait({ ok: true }), unsubscribe: () => wait({ ok: true }) },
  };
  const valid = ['account', 'notifications', 'team', 'golf', 'coachhelm', 'preferences'];
  return <SettingsView data={data} writes={writes} device={device} initialSection={(valid.includes(section ?? '') ? section : 'account') as ChSettingsSection} onDeleted={() => {}} />;
}
