'use client';

import { createClient } from '@/lib/supabase/client';
import { updateNotificationPreferences } from '@/app/actions/notification-preferences';
import { setAllChannels, setCategoryChannel, setQuietMode } from '@/app/golf/actions/v3/notification-prefs';
import { revalidateCoachingPhilosophyPaths, saveCoachingPhilosophy } from '@/app/golf/actions/coaching-philosophy';
import { cancelJoinRequest, createTeamJoinRequest, regenerateJoinCode } from '@/app/golf/actions/teams';
import { updateTeamCoachHelmSettings } from '@/app/golf/actions/insights';
import { clearActiveTeam } from '@/app/golf/actions/team-switcher';
import { clearAllCachedResources } from '@/lib/golf/client-resource-cache';
import { PHILOSOPHY_DEFAULTS } from '@/lib/coachhelm/constants';
import { tsToDb } from '@/lib/coachhelm/philosophy-map';
import { isNativeApp } from '@/lib/utils/capacitor';
import { fromUntyped } from '@/lib/supabase/untyped';
import { chReport } from '../../lib/track';
import { chSignOut } from '../../lib/sign-out';
import type { ChResult, ChSettingsWrites } from './model';

/**
 * The live writes. Each keeps the table, columns and server action the
 * current Settings page uses, and returns `{success, error}` so every one
 * runs through useAction (toast, haptic, Sentry). Supabase errors are read,
 * never dropped.
 */

const res = <T = unknown,>(error: { message?: string } | null | undefined): ChResult<T> => (error ? { success: false, error: error.message || 'failed' } : { success: true });
/**
 * An UPDATE whose row a policy hides does not fail: it comes back with no error and no row. `count: 'exact'` tells
 * the two apart, so a refused save is a failure the person sees rather than a card that says "saved".
 */
const changed = <T = unknown,>(error: { message?: string } | null | undefined, count: number | null, what: string): ChResult<T> =>
  error ? res<T>(error) : count === 0 ? { success: false, error: `Nothing was saved. ${what} was not found, or you are not allowed to change it.` } : { success: true };
const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function createLiveWrites(ctx: {
  role: 'coach' | 'player';
  userId: string;
  email: string | null;
  coachId: string | null;
  playerId: string | null;
  teamId: string | null;
  refresh: () => void;
}): ChSettingsWrites {
  const sb = createClient();
  return {
    refresh: ctx.refresh,

    async saveProfile(p) {
      const { error, count } =
        ctx.role === 'coach'
          ? await sb.from('golf_coaches').update({ full_name: p.fullName.trim(), avatar_url: p.avatarUrl }, { count: 'exact' }).eq('user_id', ctx.userId)
          : await sb.from('golf_players').update({ first_name: p.firstName.trim(), last_name: p.lastName.trim(), avatar_url: p.avatarUrl }, { count: 'exact' }).eq('user_id', ctx.userId);
      return changed(error, count, 'Your profile');
    },

    async uploadAvatar(file) {
      if (!file.type.startsWith('image/')) return { success: false, error: 'Choose an image file.' };
      // The avatars bucket caps uploads at 2 MB (JPEG, PNG, GIF, WebP).
      if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) return { success: false, error: 'Use a JPEG, PNG, GIF or WebP photo.' };
      if (file.size > 2 * 1024 * 1024) return { success: false, error: 'Photos must be under 2 MB.' };
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      // Same bucket and folder rule as the current avatar upload (storage RLS keys on the user folder).
      const path = `${ctx.userId}/avatar-${Date.now()}.${ext}`;
      const { data, error } = await sb.storage.from('avatars').upload(path, file, { cacheControl: '3600', upsert: true });
      if (error || !data) return res(error ?? { message: 'upload failed' });
      const { data: pub } = sb.storage.from('avatars').getPublicUrl(data.path);
      return { success: true, data: { url: pub.publicUrl } };
    },

    async changeEmail(email) {
      const { error } = await sb.auth.updateUser({ email: email.trim() });
      return res(error);
    },

    async changePassword(current, next) {
      if (!ctx.email) return { success: false, error: 'Your account has no email to confirm with.' };
      // Re-authenticate first, as the current page does.
      const check = await sb.auth.signInWithPassword({ email: ctx.email, password: current });
      if (check.error) return { success: false, error: 'Your current password is incorrect.' };
      const { error } = await sb.auth.updateUser({ password: next });
      return res(error);
    },

    setDelivery: (key, value) => updateNotificationPreferences({ [key]: value }),

    async setDigest(on) {
      if (!ctx.coachId) return { success: false, error: 'No coach profile' };
      return saveCoachingPhilosophy(ctx.coachId, { email_digest_enabled: on });
    },

    setRoutingCell: (c, channel, on) => setCategoryChannel(c, channel, on),
    setRoutingAll: (prefs) => setAllChannels(prefs),
    setRoutingQuiet: (on) => setQuietMode(on),

    async saveScoring(s) {
      const { error } = await sb.from('golf_team_settings').upsert(
        { team_id: ctx.teamId!, scoring_format: s.scoringFormat, handicap_system: s.handicapSystem, default_tees: s.defaultTees, timezone: s.timezone, updated_at: new Date().toISOString() },
        { onConflict: 'team_id' },
      );
      return res(error);
    },

    async saveReminders(r) {
      const { error } = await sb.from('golf_team_settings').upsert(
        {
          team_id: ctx.teamId!,
          event_reminders_enabled: r.enabled,
          event_reminder_early_hours: r.earlyHours,
          event_reminder_late_minutes: r.lateMinutes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'team_id' },
      );
      return res(error);
    },

    async saveTeam(t) {
      const at = new Date().toISOString();
      if (t.org && !t.org.name.trim()) return { success: false, error: 'The school needs a name.' };
      if (t.org) {
        // Blank clears the field (the current page couldn't clear one once set).
        const blank = (v: string) => (v.trim() === '' ? null : v.trim());
        const { error, count } = await sb
          .from('organizations')
          .update(
            { name: t.org.name.trim(), location_city: blank(t.org.city), location_state: blank(t.org.state), division: blank(t.org.division), conference: blank(t.org.conference), updated_at: at },
            { count: 'exact' },
          )
          .eq('id', t.org.id);
        const school = changed(error, count, 'The school');
        if (!school.success) return school;
      }
      const { error, count } = await sb.from('golf_teams').update({ name: t.name.trim(), season: t.season.trim() || null, updated_at: at }, { count: 'exact' }).eq('id', t.id);
      return changed(error, count, 'The team');
    },

    regenerateCode: () => regenerateJoinCode(ctx.teamId!),

    async saveGolf(d) {
      const { error, count } = await sb
        .from('golf_players')
        .update(
          {
            handicap: num(d.handicap),
            handicap_index: num(d.handicapIndex),
            graduation_year: num(d.graduationYear),
            hometown: d.hometown.trim() || null,
            state: d.state.trim().toUpperCase() || null,
            phone: d.phone.trim() || null,
            updated_at: new Date().toISOString(),
          },
          { count: 'exact' },
        )
        .eq('id', ctx.playerId!);
      return changed(error, count, 'Your golf profile');
    },

    async leaveTeam() {
      // RLS "Players can leave teams": player_id = the caller's own player.
      const { error, count } = await sb
        .from('golf_team_members')
        .delete({ count: 'exact' })
        .eq('player_id', ctx.playerId!)
        .eq('team_id', ctx.teamId!);
      if (error) return res(error);
      return count === 0 ? { success: false, error: 'You are not on that team.' } : { success: true };
    },

    requestJoin: (code, message) => createTeamJoinRequest(code.trim().toUpperCase(), ctx.playerId!, message.trim() || undefined),
    cancelRequest: (id) => cancelJoinRequest(id),

    async setCoachHelmCoach(patch) {
      const cols: { enabled?: boolean; auto_insights?: boolean; weekly_summary?: boolean; trend_alerts?: boolean } = {};
      if (patch.enabled !== undefined) cols.enabled = patch.enabled;
      if (patch.showInsights !== undefined) cols.auto_insights = patch.showInsights;
      if (patch.showPredictions !== undefined) cols.weekly_summary = patch.showPredictions;
      if (patch.showPatterns !== undefined) cols.trend_alerts = patch.showPatterns;
      const { data, error } = await sb.from('golf_coachhelm_settings').update(cols).eq('coach_id', ctx.coachId!).select('id');
      if (error) return res(error);
      if (data && data.length) return { success: true };
      const ins = await sb.from('golf_coachhelm_settings').insert({ coach_id: ctx.coachId!, enabled: true, auto_insights: true, weekly_summary: true, trend_alerts: true, ...cols });
      return res(ins.error);
    },

    setCoachHelmTeam: (enabled) => updateTeamCoachHelmSettings(ctx.teamId!, { enabled }),

    async savePhilosophy(id, patch) {
      const cols = tsToDb(patch);
      if (id) {
        const { error, count } = await fromUntyped(sb, 'golf_coach_philosophy').update(cols, { count: 'exact' }).eq('id', id);
        const done = changed<{ id: string }>(error, count, 'Your coaching settings');
        if (!done.success) return done;
        await revalidateCoachingPhilosophyPaths();
        return { success: true, data: { id } };
      }
      // First save: create the row with the app's priority defaults, then the change.
      const { data, error } = await fromUntyped(sb, 'golf_coach_philosophy')
        .insert({
          coach_id: ctx.coachId!,
          priority_ball_striking: PHILOSOPHY_DEFAULTS.priorityBallStriking,
          priority_short_game: PHILOSOPHY_DEFAULTS.priorityShortGame,
          priority_putting: PHILOSOPHY_DEFAULTS.priorityPutting,
          priority_course_management: PHILOSOPHY_DEFAULTS.priorityCourseManagement,
          priority_mental_game: PHILOSOPHY_DEFAULTS.priorityMentalGame,
          ...cols,
        })
        .select('id')
        .single();
      if (error || !data) return res(error ?? { message: 'insert failed' });
      await revalidateCoachingPhilosophyPaths();
      return { success: true, data: { id: data.id } };
    },

    async deleteAccount() {
      const r = await fetch('/api/account/delete', { method: 'DELETE' });
      const body = (await r.json().catch(() => ({}))) as { success?: boolean; error?: string };
      return r.ok && body.success ? { success: true } : { success: false, error: body.error || `Delete failed (${r.status})` };
    },

    async cleanupAfterDelete() {
      // The account is gone server-side; clear this device too before leaving.
      clearAllCachedResources();
      await clearActiveTeam().catch((err: unknown) => chReport(err, { surface: 'settings.session', action: 'clearActiveTeam', severity: 'low' }));
      await sb.auth.signOut().catch((err: unknown) => chReport(err, { surface: 'settings.session', action: 'signOutAfterDelete', severity: 'low' }));
      window.location.assign(afterDeleteHref());
    },

    // The same sign-out as the phone's More sheet (lib/sign-out.ts).
    signOut: chSignOut,
  };
}

export function afterDeleteHref(): string {
  return isNativeApp() ? '/golf/login' : '/';
}
