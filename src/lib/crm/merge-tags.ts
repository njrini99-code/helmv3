// ============================================================================
// CRM MERGE TAGS — single source of truth for the 11 cold-outreach tokens
// ============================================================================
//
// One canonical `mergeTags(text, recipient)` that BOTH the manual "Open in
// Gmail" path (src/lib/crm/gmail-compose.ts) and the automated Resend sends
// (src/app/api/admin/crm/send-email/route.ts, scripts/process-sequence-batch.mjs)
// delegate to, so a template renders byte-identically no matter who sends it.
//
// The 11 tokens + name-split fallbacks intentionally MIRROR the canonical merge
// block in src/app/api/admin/crm/send-email/route.ts (lines ~192-217):
//   {name} {first_name} {last_name} {email} {title} {school}
//   {conference} {division} {program} {team_size} {current_software}
//
// PURE module: no 'use client', no React, no Supabase, no I/O. Safe to import
// from client components, server actions, API routes, and tests.
// ============================================================================

/**
 * The coach/recipient-shaped fields a template can interpolate.
 *
 * `id` / `email` / `name` are required (the send-email route's `Recipient`
 * contract); everything else is optional. `first_name` / `last_name` may be
 * supplied explicitly — when absent they are derived from `name` (see below).
 */
export interface Recipient {
  id: string;
  email: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  school?: string | null;
  conference?: string | null;
  division?: string | null;
  program?: string | null;
  team_size?: number | null;
  current_software?: string | null;
}

/** The canonical 11 merge tokens, in the order the send route replaces them. */
export const MERGE_TOKENS = [
  'name',
  'first_name',
  'last_name',
  'email',
  'title',
  'school',
  'conference',
  'division',
  'program',
  'team_size',
  'current_software',
] as const;

/**
 * Server-resolved tokens that mergeTags() deliberately does NOT replace.
 * `{unsubscribe_url}` becomes the recipient's real one-click unsubscribe link
 * via applyUnsubTag() (unsubscribe-token.ts) inside every send path — it needs
 * the server-only HMAC secret, so a client-side preview leaves it literal.
 */
export const SERVER_TOKENS = ['unsubscribe_url'] as const;

export type MergeToken = (typeof MERGE_TOKENS)[number];

/**
 * Replace ALL 11 merge tokens in `text` with the recipient's values.
 *
 * - `first_name` defaults to `name.split(' ')[0]` when not explicitly set.
 * - `last_name`  defaults to the remainder of `name` after the first token.
 * - Any missing / null value renders as an empty string.
 *
 * Mirrors the canonical block in src/app/api/admin/crm/send-email/route.ts
 * exactly (same `??` chaining, same name-split fallbacks), so this is the
 * single source of truth (closes G10).
 */
export function mergeTags(text: string, r: Recipient): string {
  return (text || '')
    .replace(/\{name\}/g, r.name)
    .replace(/\{first_name\}/g, r.first_name ?? r.name.split(' ')[0] ?? '')
    .replace(/\{last_name\}/g, r.last_name ?? r.name.split(' ').slice(1).join(' ') ?? '')
    .replace(/\{email\}/g, r.email)
    .replace(/\{title\}/g, r.title ?? '')
    .replace(/\{school\}/g, r.school ?? '')
    .replace(/\{conference\}/g, r.conference ?? '')
    .replace(/\{division\}/g, r.division ?? '')
    .replace(/\{program\}/g, r.program ?? '')
    .replace(/\{team_size\}/g, String(r.team_size ?? ''))
    .replace(/\{current_software\}/g, r.current_software ?? '');
}
