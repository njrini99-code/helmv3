'use client';

import { useMemo } from 'react';
import type { ChDevice, ChResult, ChSettingsData, ChSettingsSection, ChSettingsWrites } from '../screens/settings/model';
import { SettingsView } from '../screens/settings/SettingsView';
import { coachData, failedRead as failed, playerData, PREVIEW_PENDING_COACHES, PREVIEW_STAFF, PREVIEW_STAFF_AS_ASSISTANT } from './fixtures-settings';

/**
 * Settings with the handoff's people and fake writes, for the dev preview.
 *   ?state= player | noteam | failed | partial | assistant | failwrites
 *   (assistant: the viewer is not the head coach, so Team has no requests or invites; failed: Team's staff reads fail)
 *   &section= account | notifications | team | golf | coachhelm | preferences
 */
const wait = <T,>(v: T, ms = 450) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const ok = <T,>(value: T) => ({ value, error: false as const });

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
      staff: {
        list: () => wait(state === 'failed' ? { success: false, error: 'preview' } : { success: true, data: state === 'assistant' ? PREVIEW_STAFF_AS_ASSISTANT : PREVIEW_STAFF }),
        pending: () => wait(state === 'assistant' ? { success: false, error: 'Only a head coach of this team can do that.' } : state === 'failed' ? { success: false, error: 'preview' } : { success: true, data: PREVIEW_PENDING_COACHES }),
        invite: (role) => wait(state === 'failwrites' ? { success: false, error: 'Only a head coach of this team can invite staff.' } : { success: true, data: { token: 'preview-token', code: 'STAFF7QX', role, hours: 72 } }),
        approve: r,
        decline: r,
      },
    };
  }, [state]);

  const device: ChDevice = {
    native: true,
    push: { status: 'unsubscribed', pending: false, subscribe: () => wait({ ok: true }), unsubscribe: () => wait({ ok: true }) },
  };
  const valid = ['account', 'notifications', 'team', 'golf', 'coachhelm', 'preferences'];
  return <SettingsView data={data} writes={writes} device={device} initialSection={(valid.includes(section ?? '') ? section : 'account') as ChSettingsSection} onDeleted={() => {}} />;
}
