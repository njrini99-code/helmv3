/**
 * Where a reply to any Helm email goes. The automated senders (notifications@, noreply@) have no mailbox, so without
 * this a coach's or player's reply was lost (owner, 2026-11-25: keep the senders, send replies to admin@).
 * HELM_REPLY_TO (the same variable the CRM outreach uses) overrides it per environment.
 */
export const HELM_REPLY_TO = process.env.HELM_REPLY_TO || 'admin@helmsportslabs.com';
