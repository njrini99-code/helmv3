/**
 * v3 email provider — Resend wrapper.
 *
 * Thin canonical wrapper around the Resend SDK so the rest of the v3
 * stack (W37 weekly coach email, W42 notification routing, W30 LLM
 * spend-alert digests) doesn't import Resend directly. Lets the provider
 * swap later if needed without rewriting callsites.
 *
 * Per Part XXVIII locked decision: Resend is the v3 email provider.
 * Resend@^6.7.0 was already installed before W9-pt3 started (confirmed
 * Task B, 2026-05-24). The `RESEND_API_KEY` env var is already wired
 * into .env.example.
 *
 * This module does NOT import React Email — templates live alongside
 * their callsites (e.g. `v3/recap/email-template.tsx` in W37).
 */

import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL =
  process.env.FROM_EMAIL || 'Helm Sports <notifications@helmsportslabs.com>';

let cachedClient: Resend | null = null;

/**
 * Lazy singleton of the Resend client. Returns null when the API key is
 * missing — callers must handle that (in dev / preview environments
 * without a key, email surfaces should fall back to logging only).
 */
function getEmailClient(): Resend | null {
  if (cachedClient) return cachedClient;
  if (!RESEND_API_KEY) return null;
  cachedClient = new Resend(RESEND_API_KEY);
  return cachedClient;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  /** React Email element. Resend renders it server-side. */
  react?: React.ReactElement;
  /** Override the default From address (e.g. for transactional vs marketing). */
  from?: string;
  /** Resend tags for analytics/segmentation. */
  tags?: Array<{ name: string; value: string }>;
  /**
   * Sent as the Resend `Idempotency-Key` header — a retry/manual re-trigger
   * of the same cron tick with the same key returns Resend's cached response
   * instead of dispatching a second email. Callers should derive this from a
   * stable per-recipient/per-period key (e.g. `job:${coachId}:${period}`).
   */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  delivered: boolean;
  id?: string;
  error?: string;
}

/**
 * Send a single email. Returns `{ delivered: false }` (not an exception)
 * when the API key is missing so cron jobs degrade gracefully in dev /
 * preview deploys.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const client = getEmailClient();
  if (!client) {
    return {
      delivered: false,
      error: 'RESEND_API_KEY not configured — email not sent',
    };
  }

  // Resend's typed payload requires exactly one of html/text/react. We
  // construct the union explicitly so TypeScript is happy.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    from: input.from ?? FROM_EMAIL,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    tags: input.tags,
  };
  if (input.react) payload.react = input.react;
  else if (input.html) payload.html = input.html;
  else if (input.text) payload.text = input.text;
  else {
    return { delivered: false, error: 'sendEmail requires one of html / text / react' };
  }

  try {
    const { data, error } = await client.emails.send(
      payload,
      input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : undefined,
    );
    if (error) {
      return { delivered: false, error: error.message };
    }
    return { delivered: true, id: data?.id };
  } catch (err) {
    return {
      delivered: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
