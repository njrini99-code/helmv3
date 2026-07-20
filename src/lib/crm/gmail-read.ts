import 'server-only';
import { importPKCS8, SignJWT } from 'jose';

// ============================================================================
// GMAIL API READ — mirror coach replies from the real admin@ mailbox into the
// CRM, WITHOUT changing what coaches see.
// ============================================================================
//
// Product decision (Nick, 2026-07-20): outreach must stay personal — Reply-To
// remains the real mailbox (admin@helmsportslabs.com), NOT a Resend-inbound
// address. That keeps replies out of the Resend webhook forever, so the CRM
// ingests them from the source instead: this module reads the impersonated
// mailbox's inbox via the SAME domain-wide-delegation service account used by
// gmail-send.ts, and the ingest-gmail-replies cron mirrors coach replies into
// crm_replies.
//
// ONE-TIME SETUP (Workspace Admin, else every call 403s and the cron no-ops):
//   Admin console -> Security -> Access and data control -> API controls ->
//   Domain-wide delegation -> edit the existing service-account client ->
//   ADD scope: https://www.googleapis.com/auth/gmail.readonly
// Uses the same env as sending: GMAIL_SA_CLIENT_EMAIL / GMAIL_SA_PRIVATE_KEY /
// GMAIL_SEND_AS. Nothing here can send, delete, or modify mail.
// ============================================================================

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export function isGmailReadConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_SA_CLIENT_EMAIL &&
      process.env.GMAIL_SA_PRIVATE_KEY &&
      process.env.GMAIL_SEND_AS,
  );
}

function privateKeyPem(): string {
  return (process.env.GMAIL_SA_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
}

// Separate token cache from gmail-send.ts — different scope, different token.
let cached: { token: string; expMs: number } | null = null;

async function getReadToken(): Promise<string> {
  if (cached && cached.expMs > Date.now() + 60_000) return cached.token;
  const saEmail = process.env.GMAIL_SA_CLIENT_EMAIL!;
  const sendAs = process.env.GMAIL_SEND_AS!;
  const key = await importPKCS8(privateKeyPem(), 'RS256');
  const nowSec = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPE })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(saEmail)
    .setSubject(sendAs)
    .setAudience(TOKEN_URL)
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + 3600)
    .sign(key);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    // A 4xx here almost always means the gmail.readonly scope has not been
    // added to the DWD client yet (see header) — callers treat it as "not
    // configured", not as a crash.
    throw new Error(`Gmail read token exchange failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expMs: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function gmailGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail API ${path} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

interface GmailHeader { name: string; value: string }
interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
}

function header(msg: GmailMessage, name: string): string | null {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

function b64urlDecode(data: string): string {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

/** Depth-first: first text/plain part's body, else first text/html. */
function extractBodies(part: GmailPart | undefined): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;
  const walk = (p: GmailPart | undefined) => {
    if (!p) return;
    if (p.mimeType === 'text/plain' && p.body?.data && text === null) text = b64urlDecode(p.body.data);
    if (p.mimeType === 'text/html' && p.body?.data && html === null) html = b64urlDecode(p.body.data);
    for (const child of p.parts ?? []) walk(child);
  };
  walk(part);
  return { text, html };
}

/** "Nick Rini <nick@x.com>" -> "nick@x.com" (lowercased). */
export function parseAddress(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim().toLowerCase() || null;
}

export interface InboundGmailMessage {
  gmailId: string;
  threadId: string;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  fromAddress: string | null;
  toAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
}

/**
 * List inbound messages from the impersonated mailbox's inbox within the
 * lookback window (not sent by the mailbox itself). Read-only.
 */
export async function listInboundMessages(lookbackDays = 2, max = 50): Promise<InboundGmailMessage[]> {
  if (!isGmailReadConfigured()) throw new Error('Gmail read is not configured (missing service-account env).');
  const token = await getReadToken();
  const q = encodeURIComponent(`in:inbox -from:me newer_than:${lookbackDays}d`);
  const list = await gmailGet<{ messages?: Array<{ id: string }> }>(
    token,
    `/messages?q=${q}&maxResults=${max}`,
  );
  const out: InboundGmailMessage[] = [];
  for (const ref of list.messages ?? []) {
    const msg = await gmailGet<GmailMessage>(token, `/messages/${ref.id}?format=full`);
    const { text, html } = extractBodies(msg.payload);
    out.push({
      gmailId: msg.id,
      threadId: msg.threadId,
      messageIdHeader: header(msg, 'Message-ID'),
      inReplyTo: header(msg, 'In-Reply-To'),
      fromAddress: parseAddress(header(msg, 'From')),
      toAddresses: (header(msg, 'To') ?? '')
        .split(',')
        .map((a) => parseAddress(a))
        .filter((a): a is string => Boolean(a)),
      subject: header(msg, 'Subject'),
      bodyText: text,
      bodyHtml: html,
      receivedAt: msg.internalDate
        ? new Date(Number(msg.internalDate)).toISOString()
        : new Date().toISOString(),
    });
  }
  return out;
}
