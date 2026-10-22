import 'server-only';

// =============================================================================
// src/lib/golf/player-invite-email.ts
//
// The GolfHelm "invite players by email" send leg (Clubhouse › Roster › Invite
// players, QUEUE doc-60). Lives OUTSIDE the `'use server'` actions module on
// purpose, as src/lib/lifting/invite-email.ts does: exporting it from a
// `'use server'` file would make it a public, directly POSTable action that
// mails arbitrary addresses. This is a plain server-only module with no action
// id; `emailPlayerInvites` (actions/team-management.ts) is the only caller and
// has already authenticated the coach, resolved the team and rate-limited.
//
// A customer email: it goes through the owner's outbound kill switch
// (gateCustomerEmail, memory/features/email_outbound.md) before it touches
// Resend, and says honestly when it did not send.
// =============================================================================

import { createHash } from 'node:crypto';
import { logServerException } from '@/lib/server-error-logger';
import { renderGolfPlayerInviteEmail } from '@/lib/email/golf-player-invite-template';
import { gateCustomerEmail, isCustomerEmailEnabled } from '@/lib/email/outbound-gate';

const FEATURE = 'golf-player-invites';
const FROM = 'Helm Sports <notifications@helmsportslabs.com>';

/** Whether an invite email can leave the product right now: the owner's switch is on and a transport is configured. */
export function canEmailPlayerInvites(): boolean {
  return isCustomerEmailEnabled() && !!process.env.RESEND_API_KEY;
}

/**
 * The join URL a player opens: NEXT_PUBLIC_APP_URL, then VERCEL_URL (scheme added when missing), then the production
 * origin (the same order as the Lift Lab invite link).
 */
export function buildGolfJoinUrl(code: string): string {
  const vercel = process.env.VERCEL_URL;
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (vercel ? (vercel.startsWith('http') ? vercel : `https://${vercel}`) : 'https://helmsportslabs.com');
  return `${base.replace(/\/+$/, '')}/golf/join/${encodeURIComponent(code)}`;
}

/**
 * One key per team, address and UTC day, so a double click or a retry after a timeout cannot mail the same player twice.
 * The address is hashed: the key travels in a header and is kept by the transport.
 */
export function inviteIdempotencyKey(teamId: string, email: string, now: Date = new Date()): string {
  const who = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 24);
  return `golf-player-invite/${teamId}/${who}/${now.toISOString().slice(0, 10)}`;
}

export type PlayerInviteEmailResult =
  /** The owner's switch is off: nothing was sent (and the gate logged one suppression). */
  | { status: 'paused' }
  /** No transport (RESEND_API_KEY) here: nothing was sent. */
  | { status: 'unconfigured' }
  /** Each address was tried: `sent` went to the transport, `failed` are the addresses to try again. */
  | { status: 'done'; sent: number; failed: string[] };

export async function sendGolfPlayerInviteEmails(params: {
  /** Normalised, de-duplicated, already validated. */
  emails: string[];
  coachName: string | null;
  teamId: string;
  teamName: string;
  joinCode: string;
}): Promise<PlayerInviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { status: 'unconfigured' };

  const gate = gateCustomerEmail({
    kind: 'golf_player_invite',
    recipientCount: params.emails.length,
    source: 'golf/actions/team-management.emailPlayerInvites',
  });
  if (!gate.allowed) return { status: 'paused' };

  const { subject, html, text } = renderGolfPlayerInviteEmail({
    coachName: params.coachName,
    teamName: params.teamName,
    joinCode: params.joinCode,
    joinUrl: buildGolfJoinUrl(params.joinCode),
  });

  const failed: string[] = [];
  let sent = 0;
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    // One message per player: a recipient list in `to` would show every address to every player.
    for (const email of params.emails) {
      try {
        const { error } = await resend.emails.send(
          { from: FROM, to: email, subject, html, text },
          { idempotencyKey: inviteIdempotencyKey(params.teamId, email) },
        );
        if (error) {
          failed.push(email);
          await logInviteFailure(new Error(`${error.name}: ${error.message}`), params.emails.length);
        } else {
          sent += 1;
        }
      } catch (err) {
        failed.push(email);
        await logInviteFailure(err, params.emails.length);
      }
    }
  } catch (err) {
    // The SDK itself would not load: nothing was tried.
    await logInviteFailure(err, params.emails.length);
    return { status: 'done', sent: 0, failed: params.emails };
  }
  return { status: 'done', sent, failed };
}

async function logInviteFailure(err: unknown, recipientCount: number): Promise<void> {
  await logServerException(
    err instanceof Error ? err : new Error(String(err)),
    {
      action: 'sendGolfPlayerInviteEmails',
      featureArea: FEATURE,
      source: 'server_action',
      handled: true,
      skipSentry: false,
      // Counts only: never an address.
      tags: { sport: 'golf', feature: FEATURE, recipients: String(recipientCount) },
    },
    'warning',
  );
}
