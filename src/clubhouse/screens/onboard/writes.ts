'use client';

import { validateAccessCode } from '@/app/golf/actions/access-code';
import { signupAction } from '@/app/golf/actions/auth';
import { completePlayerOnboarding } from '@/app/golf/actions/onboarding';
import { submitDemoRequest } from '@/app/actions/demo-request';
import { createClient } from '@/lib/supabase/client';
import { chReport } from '../../lib/track';
import { REQUEST_INTEREST, requestMessage, type CodeKind, type RequestDetails } from './logic';

/**
 * Every server call sign-up makes. These are today's actions, called the way
 * today's sign-up calls them, so the new screens change presentation and
 * nothing the server decides: the gate cookie, the rate limits, the roster and
 * staff namespaces, the join, the age of the account.
 */

const offlineLike = (e: unknown) => /fetch|network|load failed/i.test(e instanceof Error ? e.message : String(e));

export type CodeCheck = { kind: 'ok'; code: CodeKind; teamName: string | null } | { kind: 'bad' } | { kind: 'net' };

/**
 * The gate. A throttled caller reads as "no match" on purpose (the server never
 * says which namespace a code belongs to when it refuses), so the design's
 * "Too many attempts" state cannot be told apart and is not drawn (Q-99).
 * The global access code opens no path here: head coaches are created by the
 * owner (Q-96), so only a roster or staff code goes on.
 */
export async function checkCode(code: string): Promise<CodeCheck> {
  try {
    const r = await validateAccessCode(code);
    if (r.scope === 'roster') return { kind: 'ok', code: 'roster', teamName: r.teamName };
    if (r.scope === 'staff') return { kind: 'ok', code: 'staff', teamName: null };
    return { kind: 'bad' };
  } catch (e) {
    if (!offlineLike(e)) chReport(e, { surface: 'onboard.code', severity: 'medium' });
    return { kind: 'net' };
  }
}

export type AccountResult = { ok: true; redirectTo: string; staffJoined: boolean } | { ok: false; error: string };

/**
 * Creates the account. The role is the code's: a roster code signs up a player,
 * a staff code an assistant (the role inside the staff token wins; 'coach' here
 * only keeps the player-only checks off). The team is never sent: the server
 * reads it from the gate cookie.
 */
export async function createAccount(input: { kind: CodeKind; email: string; password: string; first: string; last: string }): Promise<AccountResult> {
  try {
    const r = await signupAction(input.email.trim(), input.password, input.kind === 'staff' ? 'coach' : 'player', input.first.trim(), input.last.trim());
    if (!r.success) return { ok: false, error: r.error || 'Signup failed' };
    const redirectTo = r.redirectTo || (input.kind === 'staff' ? '/golf/dashboard' : '/golf/player');
    // A staff code that could not be redeemed still makes the account and sends it elsewhere; only the dashboard means staff access.
    return { ok: true, redirectTo, staffJoined: input.kind === 'staff' && redirectTo === '/golf/dashboard' };
  } catch (e) {
    if (!offlineLike(e)) chReport(e, { surface: 'onboard.account', severity: 'high' });
    return { ok: false, error: e instanceof Error ? e.message : 'Signup failed' };
  }
}

export interface ProfileInput {
  first: string;
  last: string;
  grad: number | null;
  hcp: number | null;
  city: string;
  state: string;
  avatarUrl: string | null;
}

export type ProfileResult = { ok: true; joinedTeam: boolean | null } | { ok: false; error: string };

/** Finishes a player: the same action and fields as today's /golf/player, with the join code the link or gate carried. */
export async function finishPlayer(p: ProfileInput, joinCode: string | null): Promise<ProfileResult> {
  try {
    const r = await completePlayerOnboarding(
      {
        firstName: p.first.trim(),
        lastName: p.last.trim(),
        ...(p.grad != null ? { gradYear: p.grad } : {}),
        // "I don't have one yet" sends nothing, so a handicap is never stored as 0.
        ...(p.hcp != null ? { handicap: p.hcp } : {}),
        ...(p.city.trim() ? { hometown: p.city.trim() } : {}),
        ...(p.state ? { state: p.state } : {}),
        ...(p.avatarUrl ? { avatarUrl: p.avatarUrl } : {}),
      },
      joinCode ?? undefined,
    );
    if (!r.success) return { ok: false, error: ('error' in r && r.error) || 'We couldn’t save your profile. Please try again.' };
    return { ok: true, joinedTeam: joinCode ? ('joinedTeam' in r ? r.joinedTeam === true : false) : null };
  } catch (e) {
    if (!offlineLike(e)) chReport(e, { surface: 'onboard.profile', severity: 'high' });
    return { ok: false, error: 'Unable to reach the server. Please check your internet connection and try again.' };
  }
}

/** Uploads a photo to the avatars bucket in the player's own folder, as today's avatar upload does. */
export async function uploadPhoto(file: File): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const { data: s, error: se } = await supabase.auth.getSession();
    if (se) return { ok: false, error: 'Couldn’t check your session just now. Check your connection and try again.' };
    const uid = s.session?.user?.id;
    if (!uid) return { ok: false, error: 'Your session has expired. Sign in again to add a photo.' };
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const { data, error } = await supabase.storage.from('avatars').upload(`${uid}/avatar-${Date.now()}.${ext}`, file, { cacheControl: '3600', upsert: true });
    if (error || !data) return { ok: false, error: 'That photo didn’t upload. Try again, or skip it for now.' };
    return { ok: true, url: supabase.storage.from('avatars').getPublicUrl(data.path).data.publicUrl };
  } catch (e) {
    if (!offlineLike(e)) chReport(e, { surface: 'onboard.photo', severity: 'medium' });
    return { ok: false, error: 'Unable to reach the server. Please check your internet connection and try again.' };
  }
}

/** Request access reaches the owner's inbound list (admin CRM), the same table the landing page's form writes. */
export async function sendRequest(d: RequestDetails): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const r = await submitDemoRequest(d.email.trim(), {
      name: `${d.first.trim()} ${d.last.trim()}`.trim(),
      school: d.school.trim(),
      message: requestMessage(d),
      source: 'signup',
      ...(d.who ? { interestType: REQUEST_INTEREST[d.who] } : {}),
    });
    return r.success ? { ok: true } : { ok: false, error: r.error || 'Your request didn’t send. Try again.' };
  } catch (e) {
    if (!offlineLike(e)) chReport(e, { surface: 'onboard.request', severity: 'medium' });
    return { ok: false, error: 'Unable to reach the server. Your details are still here. Check your connection and try again.' };
  }
}
