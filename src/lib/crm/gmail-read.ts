import 'server-only';
import { importPKCS8, SignJWT } from 'jose';
import type { Json } from '@/lib/types';

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
//
// READ-ONLY INVARIANT: the JWT is minted for gmail.readonly ONLY, and every
// Gmail call in this file goes through gmailGet(), which hard-codes an HTTP
// GET. Do not add a transport helper that takes a method — a mutating call
// here would touch a real founder mailbox. The 2026-07-24 additions below
// (automation headers, original-case sender) are extra PARSING of the same GET
// response and add no new API surface.
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

/**
 * The ONLY Gmail transport in this module. The GET is hard-coded — read the
 * read-only invariant in the file header before adding anything here.
 */
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

/**
 * First `message/delivery-status` part's raw text (RFC 3464 DSN). Mirrors
 * extractBodies()'s depth-first walk shape — that walker only matches
 * text/plain and text/html and silently skips this part, which is where a
 * standards-conformant DSN actually reports the failed address(es).
 */
function extractDeliveryStatus(part: GmailPart | undefined): string | null {
  let out: string | null = null;
  const walk = (p: GmailPart | undefined) => {
    if (!p || out !== null) return;
    if (p.mimeType === 'message/delivery-status' && p.body?.data) {
      out = b64urlDecode(p.body.data);
      return;
    }
    for (const child of p.parts ?? []) walk(child);
  };
  walk(part);
  return out;
}

/**
 * "Nick Rini <nick@x.com>" -> "nick@x.com", ORIGINAL CASING PRESERVED.
 *
 * Split out of parseAddress() on 2026-07-24 so the ingest cron can store a
 * sender exactly as it arrived. crm_coaches.email keeps whatever casing the
 * import CSV had, and the mismatch between that and the lowercased form below
 * is precisely what made every mixed-case coach row unmatchable — keeping the
 * original around makes that diagnosable from the captured row itself rather
 * than only from the Gmail UI.
 */
export function parseAddressPreserveCase(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m?.[1] ?? raw).trim() || null;
}

/** "Nick Rini <nick@x.com>" -> "nick@x.com" (lowercased). */
export function parseAddress(raw: string | null): string | null {
  return parseAddressPreserveCase(raw)?.toLowerCase() || null;
}

// ---------------------------------------------------------------------------
// Automation / bounce detection
// ---------------------------------------------------------------------------
//
// The ingest cron now captures mail from senders that do NOT match a coach
// (crm_unmatched_inbound) instead of dropping it — that is the whole point of
// the fix, since a cold prospect emailing admin@ used to vanish with no row
// and no log. But an inbox is mostly machines: bounce notifications, vacation
// auto-replies, no-reply@ blasts. Without a filter the new table fills with
// noise and nobody reads it, which reintroduces the original failure by a
// different route.
//
// DELIBERATELY NARROW. A false positive here silently discards a real buying
// signal — the exact failure mode this workstream exists to fix. A false
// negative just costs one junk row an admin can ignore. So the sender list
// holds only local-parts that are machines by convention (RFC 5321 postmaster,
// RFC 3834 no-reply style, bounce daemons) and NOT plausible-but-shared human
// mailboxes like info@, support@, athletics@ or notifications@ — a college
// coach really does reply from addresses like those.

/** Local-parts that are machines by convention. Exact match, after +tag strip. */
const AUTOMATED_SENDER_LOCAL_PARTS = new Set([
  'mailer-daemon',
  'mailerdaemon',
  'mail-daemon',
  'postmaster',
  'no-reply',
  'noreply',
  'no_reply',
  'donotreply',
  'do-not-reply',
  'do_not_reply',
  'autoreply',
  'auto-reply',
  'bounce',
  'bounces',
]);

/**
 * Same convention, but with a per-send suffix — `noreply-a83f21@vendor.com`,
 * `mailer-daemon-2@googlemail.com`. Kept separate from the exact set so the
 * exact set stays readable and so prefix matching stays an explicit choice.
 */
const AUTOMATED_SENDER_LOCAL_PREFIXES = [
  'mailer-daemon',
  'no-reply',
  'noreply',
  'donotreply',
  'do-not-reply',
];

/**
 * Precedence values treated as machine mail. NOTE the omission: `list` is NOT
 * here. Some university mail systems stamp `Precedence: list` on ordinary
 * staff mail that passes through a departmental alias, and dropping those
 * would lose real coach replies — the cost asymmetry described above.
 */
const AUTOMATED_PRECEDENCE_VALUES = new Set(['bulk', 'auto_reply', 'junk']);

export type InboundAutomationReason =
  /** Return-Path: <> — the null reverse path every bounce carries (RFC 5321). */
  | 'null_return_path'
  /** X-Failed-Recipients present — a delivery status notification. */
  | 'failed_recipients'
  /** Auto-Submitted with any value other than `no` (RFC 3834). */
  | 'auto_submitted'
  /** X-Autoreply / X-Autorespond present — non-standard vacation responders. */
  | 'auto_reply_header'
  /** Precedence: bulk | auto_reply | junk. */
  | 'bulk_precedence'
  /** Sender local-part is a machine by convention (see the lists above). */
  | 'automated_sender';

/**
 * The signals classifyInboundAutomation() reads. Narrow on purpose so a test
 * can build a literal instead of a whole InboundGmailMessage.
 */
export type InboundAutomationSignals = Pick<
  InboundGmailMessage,
  'fromAddress' | 'autoSubmitted' | 'precedence' | 'returnPath' | 'hasAutoReplyHeader' | 'failedRecipients'
>;

/** True when `address`'s local-part is a machine by convention. */
export function isAutomatedSenderAddress(address: string | null): boolean {
  if (!address) return false;
  const at = address.lastIndexOf('@');
  if (at <= 0) return false;
  // Strip any `+tag`: `noreply+1234@x.com` is the same mailbox as `noreply@`.
  const localPart = address.slice(0, at).toLowerCase().split('+')[0] ?? '';
  if (!localPart) return false;
  if (AUTOMATED_SENDER_LOCAL_PARTS.has(localPart)) return true;
  return AUTOMATED_SENDER_LOCAL_PREFIXES.some((prefix) => {
    const suffix = localPart.slice(prefix.length);
    return (
      localPart.startsWith(prefix) &&
      suffix.length > 0 &&
      (/^[\d._-]/.test(suffix))
    );
  });
}

/**
 * Returns WHY a message is machine-generated, or null if it looks human.
 *
 * Pure — every input is an argument, so the cron filters without a network
 * call and the suite can exercise every branch. Ordered most-specific-first so
 * the reason recorded in the cron's counters is the informative one: a bounce
 * from mailer-daemon reports 'null_return_path', not the weaker
 * 'automated_sender'.
 */
export function classifyInboundAutomation(
  message: InboundAutomationSignals,
): InboundAutomationReason | null {
  // Bounces first. The null reverse path is the definitive marker, and DSNs
  // from hosts that omit it still carry X-Failed-Recipients.
  if (message.returnPath !== null && /^\s*<\s*>\s*$/.test(message.returnPath)) {
    return 'null_return_path';
  }
  if (message.failedRecipients !== null && message.failedRecipients.trim() !== '') {
    return 'failed_recipients';
  }

  // RFC 3834: `Auto-Submitted: no` is the explicit "a human sent this" value;
  // auto-generated / auto-replied / anything else means a machine did.
  if (message.autoSubmitted !== null) {
    const value = message.autoSubmitted.trim().toLowerCase();
    if (value !== '' && value !== 'no') return 'auto_submitted';
  }
  if (message.hasAutoReplyHeader) return 'auto_reply_header';

  if (message.precedence !== null) {
    // Precedence can carry parameters (`bulk; foo=bar`) — compare the token.
    const token = message.precedence.trim().toLowerCase().split(';')[0]?.trim() ?? '';
    if (AUTOMATED_PRECEDENCE_VALUES.has(token)) return 'bulk_precedence';
  }

  if (isAutomatedSenderAddress(message.fromAddress)) return 'automated_sender';

  return null;
}

export interface InboundGmailMessage {
  gmailId: string;
  threadId: string;
  messageIdHeader: string | null;
  inReplyTo: string | null;
  /** Lowercased — use this for every comparison. */
  fromAddress: string | null;
  /** The same address with the sender's original casing (parseAddressPreserveCase). */
  fromAddressRaw: string | null;
  toAddresses: string[];
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: string;
  // --- automation signals: raw header values, read by classifyInboundAutomation ---
  /** Auto-Submitted (RFC 3834). */
  autoSubmitted: string | null;
  /** Precedence. */
  precedence: string | null;
  /** Return-Path — `<>` on bounces. */
  returnPath: string | null;
  /** X-Autoreply or X-Autorespond present. */
  hasAutoReplyHeader: boolean;
  /** X-Failed-Recipients — present on delivery status notifications. */
  failedRecipients: string | null;
  /** First message/delivery-status part's raw text (RFC 3464 DSN), or null. The
   *  reliable machine-readable source for WHICH address bounced when a
   *  university mail server generates a standards-conformant DSN. */
  deliveryStatusText: string | null;
  /** Original Gmail API message, retained for lossless unmatched-mail recovery. */
  rawPayload: Json;
}

// ---------------------------------------------------------------------------
// Lookback window
// ---------------------------------------------------------------------------

/**
 * Default window. Was a hard-coded 2 days at the call site, which left almost
 * no slack for a daily cron: one missed run plus a slow retry silently lost a
 * day of replies with no way to get them back.
 */
export const DEFAULT_LOOKBACK_DAYS = 7;
/**
 * Hard ceiling for a manual backfill. 365 days, wide enough for a `?days=`
 * backfill to reach back to the March start of the campaign this cron exists
 * to recover replies from. The actual runtime safety valve is MAX_MESSAGES
 * (500), NOT this constant — MAX_MESSAGES is independent of `days`, so
 * raising the day ceiling does not raise the worst-case GET count per run,
 * it only lets a wider window be requested. Recover a gap wider than one
 * page's worth of mail as consecutive narrower windows — both destination
 * tables enforce UNIQUE(message_id), so overlaps are free.
 */
export const MAX_LOOKBACK_DAYS = 365;
export const MIN_LOOKBACK_DAYS = 1;
/** Message budget grows with the window, up to Gmail's own maxResults cap. */
const MESSAGES_PER_DAY = 50;
export const MAX_MESSAGES = 500;
/**
 * Gmail message bodies are independent requests. Fetch a small batch in
 * parallel so a 350-message scheduled window does not become 350 serial
 * network round trips, while staying well below Gmail's per-user burst limits.
 */
const MESSAGE_FETCH_CONCURRENCY = 10;

/**
 * Turn a caller-supplied `days` value into a SAFE (days, maxMessages) pair.
 *
 * The value is CLAMPED to [MIN_LOOKBACK_DAYS, MAX_LOOKBACK_DAYS] rather than
 * rejected, and anything unparseable falls back to the default — a scheduled
 * invocation passes no value at all, and a typo in a hand-run backfill
 * (`?days=3000`) must not become an unbounded mailbox scan (that ceiling is
 * MAX_LOOKBACK_DAYS; the actual per-run cost cap is MAX_MESSAGES, below).
 *
 * Lives here rather than in the route because a Next.js App Router `route.ts`
 * may only export handlers and the known segment-config symbols; an exported
 * helper there fails the build's route type-check and so could never be
 * unit-tested.
 */
export function resolveLookbackWindow(rawDays: string | null): {
  days: number;
  maxMessages: number;
} {
  let requested: number | null = null;
  if (rawDays !== null) {
    const parsed = Number.parseInt(rawDays, 10);
    if (Number.isFinite(parsed)) requested = parsed;
  }
  const days =
    requested === null
      ? DEFAULT_LOOKBACK_DAYS
      : Math.min(MAX_LOOKBACK_DAYS, Math.max(MIN_LOOKBACK_DAYS, requested));
  return { days, maxMessages: Math.min(MAX_MESSAGES, days * MESSAGES_PER_DAY) };
}

/**
 * List inbound messages from the impersonated mailbox within the lookback
 * window (not sent by the mailbox itself). Read-only. Scans ALL mail, not
 * just Inbox — see the search-query comment below for why.
 *
 * `max` goes straight to Gmail's `maxResults`, which the API hard-caps at 500.
 * There is no pagination here on purpose: every listed message costs a second
 * GET and the cron's maxDuration is 120s. Message detail requests are fetched
 * in bounded parallel batches so a normal seven-day window does not serialize
 * hundreds of independent round trips. A backfill wider than one page's worth
 * of mail should still be run as several narrower `?days=` windows —
 * crm_replies.message_id and crm_unmatched_inbound.message_id are both UNIQUE,
 * so overlapping windows are free.
 */
export async function listInboundMessages(lookbackDays = 2, max = 50): Promise<InboundGmailMessage[]> {
  if (!isGmailReadConfigured()) throw new Error('Gmail read is not configured (missing service-account env).');
  const token = await getReadToken();
  // No `in:` qualifier searches ALL mail (archived, labelled, filtered —
  // everything `in:inbox` was missing) while Gmail's own default still
  // excludes Spam and Trash without an explicit -in:spam -in:trash (documented
  // Gmail search behavior). -in:drafts keeps an unsent draft in our own
  // Compose window from ever being read as "inbound".
  const q = encodeURIComponent(`-from:me -in:drafts newer_than:${lookbackDays}d`);
  const list = await gmailGet<{ messages?: Array<{ id: string }> }>(
    token,
    `/messages?q=${q}&maxResults=${max}`,
  );
  const refs = list.messages ?? [];
  const out: InboundGmailMessage[] = [];
  for (let offset = 0; offset < refs.length; offset += MESSAGE_FETCH_CONCURRENCY) {
    const batch = refs.slice(offset, offset + MESSAGE_FETCH_CONCURRENCY);
    const messages = await Promise.all(
      batch.map((ref) => gmailGet<GmailMessage>(token, `/messages/${ref.id}?format=full`)),
    );
    for (const msg of messages) {
      const { text, html } = extractBodies(msg.payload);
      const fromHeader = header(msg, 'From');
      out.push({
        gmailId: msg.id,
        threadId: msg.threadId,
        messageIdHeader: header(msg, 'Message-ID'),
        inReplyTo: header(msg, 'In-Reply-To'),
        fromAddress: parseAddress(fromHeader),
        fromAddressRaw: parseAddressPreserveCase(fromHeader),
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
        autoSubmitted: header(msg, 'Auto-Submitted'),
        precedence: header(msg, 'Precedence'),
        returnPath: header(msg, 'Return-Path'),
        hasAutoReplyHeader:
          header(msg, 'X-Autoreply') !== null || header(msg, 'X-Autorespond') !== null,
        failedRecipients: header(msg, 'X-Failed-Recipients'),
        deliveryStatusText: extractDeliveryStatus(msg.payload),
        rawPayload: msg as unknown as Json,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bounce recipient extraction
// ---------------------------------------------------------------------------

export interface BounceRecipientSignals {
  failedRecipients: string | null;
  deliveryStatusText: string | null;
  bodyText: string | null;
}

/**
 * Pull the address(es) that bounced out of a DSN, most-reliable source first.
 * Pure — narrow signals so a test can build a literal, matching
 * InboundAutomationSignals's pattern above.
 *
 *   1. X-Failed-Recipients — de-facto standard many MTAs (incl. Google's own)
 *      stamp with a comma/semicolon list of failed addresses. Authoritative
 *      when present.
 *   2. RFC 3464 `Final-Recipient: rfc822; addr` field(s) inside the
 *      message/delivery-status part — the machine-readable part almost every
 *      standards-conformant MTA (Postfix/Exchange/Sendmail) includes even
 *      when X-Failed-Recipients is absent. Collects every occurrence (a
 *      multi-recipient bounce can report more than one).
 *   3. Best-effort prose fallback for bounces that skip both — scoped to the
 *      single paragraph right after the "failed"/"undeliverable" phrase so a
 *      DSN that quotes the ORIGINAL message underneath (with ITS OWN To/From
 *      headers) can never leak an unrelated address into the result.
 *
 * Returns [] when nothing could be extracted — callers must log that
 * (`processBounce` in the route does), never assume "no recipient failed".
 */
export function extractBouncedRecipients(message: BounceRecipientSignals): string[] {
  const out = new Set<string>();

  // A DSN is only PERMANENT when it says so. RFC 3464 emits the same report
  // shape for `Action: delayed` (4.x.x transient — Gmail's "Delivery Status
  // Notification (Delay)" after a greylist or a brief outage) and for
  // `Action: relayed`/`expanded`, and those carry BOTH a null Return-Path and
  // an X-Failed-Recipients header. Treating one as a hard bounce suppresses a
  // coach whose mailbox is fine and whose mail delivers minutes later, with no
  // signal that anything went wrong — an unrecoverable, silent loss of a real
  // prospect. Bail before extracting anything unless the report is permanent.
  if (message.deliveryStatusText && !isPermanentFailureDsn(message.deliveryStatusText)) {
    return [];
  }

  if (message.failedRecipients) {
    for (const raw of message.failedRecipients.split(/[;,]/)) {
      const addr = parseAddress(raw);
      if (addr) out.add(addr);
    }
    if (out.size > 0) return Array.from(out);
  }

  if (message.deliveryStatusText) {
    const re = /Final-Recipient:\s*rfc822;\s*([^\s<>,;]+@[^\s<>,;]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(message.deliveryStatusText)) !== null) {
      const addr = parseAddress(m[1] ?? null);
      if (addr) out.add(addr);
    }
    if (out.size > 0) return Array.from(out);
  }

  if (message.bodyText) {
    const scoped = scopedBounceParagraph(message.bodyText);
    if (scoped) {
      const emailRe = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
      let m: RegExpExecArray | null;
      while ((m = emailRe.exec(scoped)) !== null) out.add(m[0].toLowerCase());
    }
  }

  return Array.from(out);
}

/**
 * True only for a DSN reporting PERMANENT failure.
 *
 * RFC 3464 §2.3.3: `Action` is one of failed / delayed / delivered / relayed /
 * expanded, and only `failed` is terminal. §2.3.4's `Status` is `class.subject
 * .detail`, where class 5 is permanent and 4 is transient. We require either
 * signal to say permanent, and we require at least one of them to be PRESENT —
 * a report carrying neither is not something we will suppress a real address
 * on. Fails closed by design: an unparseable DSN yields no suppression, which
 * costs us one re-send, versus wrongly blacklisting a live coach forever.
 */
function isPermanentFailureDsn(deliveryStatusText: string): boolean {
  const hasAction = /^\s*Action:/im.test(deliveryStatusText);
  const hasStatus = /^\s*Status:/im.test(deliveryStatusText);
  if (!hasAction && !hasStatus) return false;

  if (/^\s*Action:\s*failed\b/im.test(deliveryStatusText)) return true;
  // Status 5.x.x with no contradicting Action: failed line still counts —
  // some MTAs omit Action entirely.
  if (!hasAction && /^\s*Status:\s*5\.\d+\.\d+/im.test(deliveryStatusText)) return true;

  return false;
}

/** Paragraph-scoped prose window for the last-resort fallback above. */
function scopedBounceParagraph(bodyText: string): string | null {
  const re =
    /(?:failed permanently|wasn't delivered to|couldn't be delivered to|delivery to the following recipient[s]? failed)[\s\S]*?\n\s*\n[\s\S]*?(?=\n\s*\n|$)/i;
  return bodyText.match(re)?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Sent-mail sync (attribution)
// ---------------------------------------------------------------------------

export interface SentGmailMessage {
  gmailId: string;
  /** Lowercased, via parseAddress — same normalization as InboundGmailMessage.fromAddress. */
  toAddresses: string[];
  subject: string | null;
  sentAt: string;
}

/**
 * List messages the impersonated mailbox itself sent within the lookback
 * window (`in:sent`). Read-only, same token/scope as listInboundMessages.
 * Feeds the sent-mail sync in ingest-gmail-replies/route.ts (item 4): a
 * coach's reply needs an existing crm_contact_log row to attribute against,
 * and any 1:1 send made straight from the Gmail UI (outside the app's
 * compose flow) never produced one.
 *
 * format=metadata + repeated metadataHeaders keeps each fetch small since
 * only the recipient and subject are read — no body decode needed.
 */
export async function listSentMessages(lookbackDays = 2, max = 50): Promise<SentGmailMessage[]> {
  if (!isGmailReadConfigured()) throw new Error('Gmail read is not configured (missing service-account env).');
  const token = await getReadToken();
  const q = encodeURIComponent(`in:sent newer_than:${lookbackDays}d`);
  const list = await gmailGet<{ messages?: Array<{ id: string }> }>(
    token,
    `/messages?q=${q}&maxResults=${max}`,
  );
  const refs = list.messages ?? [];
  const out: SentGmailMessage[] = [];
  for (let offset = 0; offset < refs.length; offset += MESSAGE_FETCH_CONCURRENCY) {
    const batch = refs.slice(offset, offset + MESSAGE_FETCH_CONCURRENCY);
    const messages = await Promise.all(
      batch.map((ref) =>
        gmailGet<GmailMessage>(
          token,
          `/messages/${ref.id}?format=metadata&metadataHeaders=To&metadataHeaders=Subject`,
        ),
      ),
    );
    for (const msg of messages) {
      out.push({
        gmailId: msg.id,
        toAddresses: (header(msg, 'To') ?? '')
          .split(',')
          .map((a) => parseAddress(a))
          .filter((a): a is string => Boolean(a)),
        subject: header(msg, 'Subject'),
        sentAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
      });
    }
  }
  return out;
}

/**
 * Read the Gmail message id a crm_contact_log row was stamped with, or null.
 * Both write paths — the app's compose-send (crm-gmail-send.ts's
 * recordGmailTouch) and the sent-mail sync pass added to
 * ingest-gmail-replies/route.ts — store it at metadata.gmail_message_id.
 * crm_contact_log has NO unique constraint of any kind on this (verified live
 * via pg_indexes), so this pure reader is the actual dedupe contract the two
 * write paths hand-shake on; kept here, not in the route, so it is
 * unit-testable without mocking Supabase.
 */
export function readContactLogGmailId(metadata: Json | null): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, Json>).gmail_message_id;
  return typeof value === 'string' ? value : null;
}
