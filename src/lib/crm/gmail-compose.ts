// ============================================================================
// GMAIL COMPOSE — pure merge + URL builders for the "Open in Gmail" feature
// ============================================================================
//
// Lets a CRM operator arm ONE email template and open a pre-filled Gmail
// compose window for any coach, so they can send manually from their own
// Gmail (outside the automated Resend batch). Free + ToS-clean.
//
// PURE module: no 'use client', no React, no Supabase, no I/O. Safe to import
// from both client components and server actions / tests.
//
// The token set + merge semantics intentionally MIRROR the cold-batch sender
// (scripts/process-sequence-batch.mjs `sub()`), so a template merged here
// renders identically to one merged by the automated batch:
//   {name} {first_name} {last_name} {email} {school} {title}
//   {conference} {division} {program} {team_size} {current_software}
// ============================================================================

/** The coach-shaped fields a template can interpolate. All optional/nullable. */
export interface MergeableCoach {
  name?: string | null;
  email?: string | null;
  school?: string | null;
  title?: string | null;
  conference?: string | null;
  division?: string | null;
  program?: string | null;
  team_size?: number | null;
  current_software?: string | null;
}

/**
 * Replace merge tokens in `text` with the coach's values.
 *
 * - `first_name` = the first whitespace-delimited token of `name`.
 * - `last_name`  = the remainder of `name` after the first token, falling back
 *   to `first_name` when the name is a single token (matches the batch sender).
 * - Any missing / null value renders as an empty string.
 *
 * Mirrors `sub()` in scripts/process-sequence-batch.mjs exactly.
 */
export function mergeTemplate(text: string, coach: MergeableCoach): string {
  const name = (coach.name ?? '').trim();
  const parts = name ? name.split(/\s+/) : [];
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ') || firstName;

  return (text || '')
    .replace(/\{name\}/g, coach.name ?? '')
    .replace(/\{first_name\}/g, firstName)
    .replace(/\{last_name\}/g, lastName)
    .replace(/\{email\}/g, coach.email ?? '')
    .replace(/\{school\}/g, coach.school ?? '')
    .replace(/\{title\}/g, coach.title ?? '')
    .replace(/\{conference\}/g, coach.conference ?? '')
    .replace(/\{division\}/g, coach.division ?? '')
    .replace(/\{program\}/g, coach.program ?? '')
    .replace(/\{team_size\}/g, coach.team_size != null ? String(coach.team_size) : '')
    .replace(/\{current_software\}/g, coach.current_software ?? '');
}

/**
 * Build a Gmail "compose new message" deep-link with the recipient, subject,
 * and body pre-filled. Opening it in a new tab pops Gmail's compose window
 * (the operator still clicks Send themselves).
 *
 * Uses Gmail's documented `view=cm&fs=1` compose URL. Every field is
 * percent-encoded so subjects/bodies with newlines, ampersands, etc. survive.
 */
export function buildGmailComposeUrl(args: { to: string; subject: string; body: string }): string {
  const { to, subject, body } = args;
  return (
    'https://mail.google.com/mail/?view=cm&fs=1' +
    `&to=${encodeURIComponent(to)}` +
    `&su=${encodeURIComponent(subject)}` +
    `&body=${encodeURIComponent(body)}`
  );
}
