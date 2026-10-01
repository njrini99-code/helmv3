'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import type { ChannelPref, NotificationCategory, PrefsByCategory } from '@/lib/coachhelm/v3/notifications/router';
import { useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';
import { useDistanceUnits } from '@/hooks/golf/use-distance-units';
import type { DistancePreference } from '@/lib/golf/distance-units';
import { areHapticsEnabled, setHapticsEnabled } from '@/lib/utils/haptics-pref';
import { useToast } from '../../ui/Toast';
import { haptic } from '../../lib/haptics';
import { chReport, chTrail } from '../../lib/track';
import { channelsFor, ROUTING_GROUPS, ROUTING_LABEL, type ChCoachHelmSettings, type ChDevice, type ChMembership, type ChSettingsData, type ChSettingsWrites } from './model';
import { useInstantSave, useSaveAction } from './parts';

/**
 * The behaviour of Settings that desktop cards and phone screens share. Each
 * hook owns a piece of state and the saves behind it (same writes, same
 * catalog numbers, same copy); the components decide only how it looks. A
 * card and a phone screen that both need "flip a delivery switch" call the
 * same hook, so a fix or a new state lands in both.
 */

/** The copy of each save toast (docs/clubhouse/catalog/settings.md, 80xx), shared by desktop and phone. */
export const SAVE_COPY = {
  profile: { done: 'Profile saved', failed: "Couldn't save your profile", code: 'CH-8001' },
  email: (v: string) => ({ done: `Confirmation sent to ${v}`, failed: "Couldn't start the email change", code: 'CH-8003' }),
  password: { done: 'Password updated', failed: "Couldn't update your password", code: 'CH-8004' },
  team: { done: 'Team details saved', failed: "Couldn't save team details", code: 'CH-8011' },
  regenerate: { done: 'New invite code ready', failed: "Couldn't make a new invite code", code: 'CH-8012' },
  scoring: { done: 'Scoring settings saved', failed: "Couldn't save scoring settings", code: 'CH-8014' },
  reminders: { done: 'Reminder schedule saved', failed: "Couldn't save the reminder schedule", code: 'CH-8015' },
  golf: { done: 'Golf details saved', failed: "Couldn't save your golf details", code: 'CH-8016' },
  leave: { done: 'You left the team', failed: "Couldn't leave the team", code: 'CH-8017' },
  join: { done: 'Request sent to the coaches', failed: "Couldn't send your request", hint: 'Check the code with your coach.', code: 'CH-8018' },
  cancel: { done: 'Request cancelled', failed: "Couldn't cancel the request", code: 'CH-8019' },
  delete: { done: 'Your account was deleted', failed: "Couldn't delete your account", code: 'CH-8023' },
} as const;

/** Email and push switches, quiet mode and the weekly team email: each flips at once and goes back if the save fails (CH-8005, CH-8006). */
export function useDelivery(prefs: Record<string, boolean>, digest: ChSettingsData['digest'], writes: ChSettingsWrites) {
  const [p, setP] = useState(prefs);
  const [dg, setDg] = useState(digest && !digest.error ? digest.value : false);
  const save = useInstantSave('notifications');
  const flip = (key: string, label: string) => (v: boolean) =>
    void save.run({
      key,
      apply: () => setP((x) => ({ ...x, [key]: v })),
      rollback: () => setP((x) => ({ ...x, [key]: !v })),
      write: () => writes.setDelivery(key, v),
      failed: `Couldn't change ${label}`,
      code: 'CH-8005',
    });
  const flipDigest = (v: boolean) =>
    void save.run({ key: 'digest', apply: () => setDg(v), rollback: () => setDg(!v), write: () => writes.setDigest(v), failed: "Couldn't change the weekly email", code: 'CH-8006' });
  return { p, dg, quiet: !!p.quiet_mode, pending: save.pending, flip, flipDigest };
}

/** Push on this device: subscribe or unsubscribe, and say why when it can't (CH-8007). */
export function usePushToggle(push: ChDevice['push']) {
  const toast = useToast();
  return async (v: boolean) => {
    chTrail(`settings device push ${v ? 'on' : 'off'}`);
    try {
      const r = v ? await push.subscribe() : await push.unsubscribe();
      // The switch already ticked (selection, D-70); only a failure adds a haptic.
      if (!r.ok) {
        haptic('error');
        if (r.error) chReport(new Error(r.error), { surface: 'settings.notifications', action: 'devicePush', severity: 'low' });
        toast({ tone: 'error', title: v ? "Couldn't turn on push here" : "Couldn't turn off push here", body: r.error && r.error.length < 90 ? r.error : 'Try again in a moment.', code: 'CH-8007' });
      }
    } catch (err) {
      haptic('error');
      chReport(err, { surface: 'settings.notifications', action: 'devicePush' });
      toast({ tone: 'error', title: "Couldn't change push on this device", body: 'Try again in a moment.', code: 'CH-8007' });
    }
  };
}

/** The player's CoachHelm updates: cell switches, whole-list changes and quiet mode (CH-8008 to CH-8010). */
export function useRouting(initial: { prefs: PrefsByCategory; quiet: boolean }, writes: ChSettingsWrites) {
  const [prefs, setPrefs] = useState(initial.prefs);
  const [quiet, setQuiet] = useState(initial.quiet);
  const save = useInstantSave('routing');
  const bulkBusy = save.pending.has('bulk');
  const cellBusy = [...save.pending].some((k) => k.startsWith('cell:'));
  const groupBusy = [...save.pending].some((k) => k.startsWith('group:'));
  const all = ROUTING_GROUPS.flatMap((g) => g.categories);

  const setCell = (c: NotificationCategory, ch: keyof ChannelPref, v: boolean) =>
    void save.run({
      key: `cell:${c}:${ch}`,
      apply: () => setPrefs((x) => ({ ...x, [c]: { ...channelsFor(x, c), [ch]: v } })),
      rollback: () => setPrefs((x) => ({ ...x, [c]: { ...channelsFor(x, c), [ch]: !v } })),
      write: () => writes.setRoutingCell(c, ch, v),
      failed: `Couldn't change ${ROUTING_LABEL[c].toLowerCase()}`,
      code: 'CH-8008',
    });

  const bulk = (next: PrefsByCategory, failed: string) => {
    const before = prefs;
    return save.run({ key: 'bulk', apply: () => setPrefs(next), rollback: () => setPrefs(before), write: () => writes.setRoutingAll(next), failed, code: 'CH-8009' });
  };

  /**
   * One channel for a whole kind of update (the phone's per-kind sheet): every category in it changes together, in one
   * write. A failure puts each category back to what it was.
   */
  const setGroup = (key: string, cats: NotificationCategory[], ch: keyof ChannelPref, v: boolean, failed: string) => {
    const was = Object.fromEntries(cats.map((c) => [c, channelsFor(prefs, c)[ch]])) as Record<NotificationCategory, boolean>;
    const next = { ...prefs, ...Object.fromEntries(cats.map((c) => [c, { ...channelsFor(prefs, c), [ch]: v }])) } as PrefsByCategory;
    return save.run({
      key: `group:${key}:${ch}`,
      apply: () => setPrefs(next),
      rollback: () => setPrefs((x) => ({ ...x, ...Object.fromEntries(cats.map((c) => [c, { ...channelsFor(x, c), [ch]: was[c] }])) })),
      write: () => writes.setRoutingAll(next),
      failed,
      code: 'CH-8008',
    });
  };

  const flipQuiet = (v: boolean) =>
    void save.run({ key: 'quiet', apply: () => setQuiet(v), rollback: () => setQuiet(!v), write: () => writes.setRoutingQuiet(v), failed: "Couldn't change quiet mode", code: 'CH-8010' });

  return { prefs, quiet, pending: save.pending, bulkBusy, cellBusy, groupBusy, all, setCell, setGroup, bulk, flipQuiet };
}

/** Coach CoachHelm: the team switch (head coach), the dashboards switch and its three parts (CH-8020, CH-8021). */
export function useCoachHelmPower(initial: ChCoachHelmSettings, writes: ChSettingsWrites) {
  const [coach, setCoach] = useState(initial.coach);
  const [team, setTeam] = useState(initial.team);
  const save = useInstantSave('coachhelm');
  const setC = (patch: Partial<ChCoachHelmSettings['coach']>, failed: string) => {
    // Only the switch that failed goes back; another one flipped meanwhile keeps its position (81302).
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, coach[k as keyof typeof coach]])) as Partial<typeof coach>;
    return save.run({ key: Object.keys(patch).join(','), apply: () => setCoach((c) => ({ ...c, ...patch })), rollback: () => setCoach((c) => ({ ...c, ...before })), write: () => writes.setCoachHelmCoach(patch), failed, code: 'CH-8020' });
  };
  const setTeamOn = (v: boolean) =>
    void save.run({
      key: 'team',
      apply: () => setTeam((t) => (t ? { ...t, enabled: v } : t)),
      rollback: () => setTeam((t) => (t ? { ...t, enabled: !v } : t)),
      write: () => writes.setCoachHelmTeam(v),
      failed: "Couldn't change CoachHelm for the team",
      code: 'CH-8021',
    });
  return { coach, team, pending: save.pending, setC, setTeamOn };
}

/** The invite code: the code on screen, a new one (after the person confirms), copy and share (CH-8012, CH-8013). */
export function useInvite(initial: string, writes: ChSettingsWrites) {
  const [code, setCode] = useState(initial);
  // Read after mount: the server has no navigator, and a mismatch would break hydration.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === 'function'), []);
  const toast = useToast();
  const regen = useSaveAction('settings.regenerateCode', writes.regenerateCode, SAVE_COPY.regenerate, (r) => {
    if (r.data?.joinCode) setCode(r.data.joinCode);
  });
  const link = typeof window === 'undefined' ? `/golf/join/${code}` : `${window.location.origin}/golf/join/${code}`;
  const copy = async (what: 'code' | 'link') => {
    chTrail(`settings copy invite ${what}`);
    try {
      await navigator.clipboard.writeText(what === 'code' ? code : link);
      haptic('success');
      toast({ title: what === 'code' ? 'Invite code copied' : 'Invite link copied' });
    } catch (err) {
      haptic('error');
      chReport(err, { surface: 'settings.invite', action: 'copy', severity: 'low' });
      toast({ tone: 'error', title: "Couldn't copy", body: 'Select the text and copy it yourself.', code: 'CH-8013' });
    }
  };
  const share = async () => {
    chTrail('settings share invite');
    try {
      await navigator.share({ title: 'Join our team on GolfHelm', text: `Join with code ${code}`, url: link });
    } catch (err) {
      // Closing the share sheet rejects with AbortError; that isn't a failure.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        chReport(err, { surface: 'settings.invite', action: 'share', severity: 'low' });
        void copy('link');
      }
    }
  };
  return { code, canShare, link, regen, copy, share };
}

/** A player's team: leave it, ask to join another, cancel a request (CH-8017 to CH-8019). */
export function useMembership(m: ChMembership, writes: ChSettingsWrites, done: { onLeft: () => void; onJoined: () => void }) {
  const [requests, setRequests] = useState(m.requests);
  const leave = useSaveAction('settings.leaveTeam', writes.leaveTeam, SAVE_COPY.leave, () => {
    done.onLeft();
    writes.refresh();
  });
  const join = useSaveAction('settings.requestJoin', writes.requestJoin, SAVE_COPY.join, () => {
    done.onJoined();
    writes.refresh();
  });
  const cancel = useSaveAction('settings.cancelRequest', writes.cancelRequest, SAVE_COPY.cancel, (_r, id) => {
    setRequests((x) => x.filter((y) => y.id !== id));
  });
  return { requests, leave, join, cancel };
}

/** A profile photo: validated and uploaded by the write, the new address handed back (CH-8002). */
export function useAvatarUpload(writes: ChSettingsWrites, onUploaded: (url: string) => void) {
  const [uploading, setUploading] = useState(false);
  const toast = useToast();
  const upload = async (picked: File) => {
    setUploading(true);
    chTrail('settings avatar upload');
    try {
      const r = await writes.uploadAvatar(picked);
      if (r.success && r.data) onUploaded(r.data.url);
      else {
        haptic('error');
        chReport(new Error(r.error || 'avatar upload failed'), { surface: 'settings.profile', action: 'uploadAvatar', severity: 'low' });
        toast({ tone: 'error', title: "Couldn't upload that photo", body: r.error && r.error.length < 80 ? r.error : 'Check your connection and try again.', code: 'CH-8002' });
      }
    } catch (err) {
      haptic('error');
      chReport(err, { surface: 'settings.profile', action: 'uploadAvatar' });
      toast({ tone: 'error', title: "Couldn't upload that photo", body: 'Check your connection and try again.', code: 'CH-8002' });
    } finally {
      setUploading(false);
    }
  };
  return { upload, uploading };
}

/** Report a problem: the in-app feedback form, or an email when it isn't available (CH-8025). */
export function useReportProblem() {
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const report = async () => {
    if (opening) return;
    setOpening(true);
    chTrail('settings report a problem');
    const mail = () => {
      toast({ title: 'Opening email', body: "The in-app report form isn't available right now.", code: 'CH-8025' });
      window.location.href = 'mailto:admin@helmsportslabs.com?subject=Problem%20report';
    };
    try {
      const dialog = await Sentry.getFeedback?.()?.createForm();
      if (!dialog) mail();
      else {
        dialog.appendToDom();
        dialog.open();
      }
    } catch {
      // The feedback widget is optional (blocked, offline, not loaded): email is the fallback, not an error.
      mail();
    } finally {
      setOpening(false);
    }
  };
  return { report, opening };
}

/** Sign out of this device; a failure says so and lets the person try again (CH-8024). */
export function useSignOut(writes: ChSettingsWrites) {
  const toast = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    chTrail('settings sign out');
    try {
      await writes.signOut();
    } catch (err) {
      chReport(err, { surface: 'settings.session', action: 'signOut' });
      haptic('error');
      toast({ tone: 'error', title: "Couldn't sign you out", body: 'Check your connection and try again.', code: 'CH-8024' });
      setSigningOut(false);
    }
  };
  return { signOut, signingOut };
}

/** Delete the account (CH-8023). The caller asks first; `landed` runs when it is gone. */
export function useDeleteAccount(writes: ChSettingsWrites, landed: () => void) {
  return useSaveAction('settings.deleteAccount', writes.deleteAccount, SAVE_COPY.delete, landed);
}

/**
 * Preferences kept on this device: animations, the distance unit and, in the native app, haptics. The unit is the one
 * Fairway's Settings writes and the shot screen reads (`golf_distance_unit_pref`): a device preference, never a column,
 * so it has no server write to fail.
 */
export function useDevicePrefs() {
  const { showAnimations, updatePreferences } = useAppearancePreferences();
  const { distancePref, setDistancePref } = useDistanceUnits();
  // Read after mount: the preference lives in this device's storage.
  const [haptics, setHaptics] = useState(true);
  useEffect(() => setHaptics(areHapticsEnabled()), []);
  return {
    animations: showAnimations,
    setAnimations: (v: boolean) => {
      chTrail(`settings animations ${v ? 'on' : 'off'}`);
      updatePreferences({ showAnimations: v });
    },
    distance: distancePref,
    setDistance: (v: DistancePreference) => {
      chTrail(`settings distance ${v}`);
      setDistancePref(v);
    },
    haptics,
    setHaptics: (v: boolean) => {
      chTrail(`settings haptics ${v ? 'on' : 'off'}`);
      setHapticsEnabled(v);
      setHaptics(v);
      // A confirming tap when turning them on, so the change is felt (D-70).
      if (v) haptic('select');
    },
  };
}
