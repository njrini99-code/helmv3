import 'server-only';
import { importPKCS8, SignJWT } from 'jose';

// ============================================================================
// GMAIL API SEND — send cold outreach straight through the real Workspace
// mailbox (admin@helmsportslabs.com), NOT through Resend.
// ============================================================================
//
// Why this exists: cold email from a real, warmed Google Workspace mailbox lands
// in Primary far more reliably than bulk ESP sends. This module sends a true
// text/plain, 1:1, personalized message via the Gmail API — the same envelope a
// human would type — which is the single biggest lever for inbox placement.
//
// Auth: Google Workspace **domain-wide delegation** with a service account.
// No interactive OAuth, no refresh-token expiry — the server mints a short-lived
// access token that impersonates GMAIL_SEND_AS. One-time setup (Google Cloud +
// Workspace Admin) is documented in docs/setup/gmail-send-setup.md.
//
// Required env (all absent by default → isGmailSendConfigured() === false, so
// nothing about the existing compose-link flow changes until it's configured):
//   GMAIL_SA_CLIENT_EMAIL  service account email (…@….iam.gserviceaccount.com)
//   GMAIL_SA_PRIVATE_KEY   the SA private key (PEM; \n-escaped is fine)
//   GMAIL_SEND_AS          mailbox to send as, e.g. admin@helmsportslabs.com
//   HELM_FROM_NAME         optional display name (default "Nick Rini")
// ============================================================================

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export function isGmailSendConfigured(): boolean {
  return Boolean(
    process.env.GMAIL_SA_CLIENT_EMAIL &&
      process.env.GMAIL_SA_PRIVATE_KEY &&
      process.env.GMAIL_SEND_AS,
  );
}

// Env stores PEM newlines as literal "\n" (Vercel single-line). Restore them.
function privateKeyPem(): string {
  return (process.env.GMAIL_SA_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
}

// In-module access-token cache (tokens last ~1h; reused across sends in a warm
// function instance, refreshed with a 60s safety margin).
let cached: { token: string; expMs: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cached && cached.expMs > Date.now() + 60_000) return cached.token;

  const saEmail = process.env.GMAIL_SA_CLIENT_EMAIL!;
  const sendAs = process.env.GMAIL_SEND_AS!;
  const key = await importPKCS8(privateKeyPem(), 'RS256');
  const nowSec = Math.floor(Date.now() / 1000);

  // DWD assertion: iss=SA, sub=impersonated mailbox, scope=gmail.send.
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
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail token exchange failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: json.access_token, expMs: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Strip anything that could break out of a single MIME header line. CR/LF are
// ASCII, so without this they'd slip past the RFC-2047 "non-ASCII only" check
// below and let a crafted subject/recipient inject extra headers (Bcc:, etc.).
// Defense-in-depth: also drop other control chars and collapse folding.
function sanitizeHeaderValue(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1F\x7F]/g, '').trim();
}

// RFC 2047 encode a header value only when it has non-ASCII chars (keeps simple
// ASCII subjects human-readable in the raw MIME). Always sanitized first so no
// CR/LF/control char can reach the header, encoded or not.
function encodeHeader(value: string): string {
  const clean = sanitizeHeaderValue(value);
  return /^[\x20-\x7E]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

// Quoted-printable encode the body (RFC 2045). Keeps mostly-ASCII text human-
// readable (the spam-safest shape) while making any non-ASCII byte 7-bit clean,
// instead of declaring 8bit and hoping every hop is 8BITMIME-clean. Hard line
// breaks are emitted as CRLF; lines are soft-wrapped at 76 chars; whitespace at
// end-of-line is encoded (per spec).
function quotedPrintableEncode(text: string): string {
  const bytes = Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'utf8');
  let out = '';
  let lineLen = 0;
  const hex = (b: number) => '=' + b.toString(16).toUpperCase().padStart(2, '0');
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    // Hard CRLF break — emit literally and reset the column counter.
    if (b === 0x0d && bytes[i + 1] === 0x0a) {
      out += '\r\n';
      lineLen = 0;
      i++;
      continue;
    }
    const atEol = bytes[i + 1] === 0x0d || i === bytes.length - 1;
    let token: string;
    if (b === 0x09 || b === 0x20) {
      token = atEol ? hex(b) : String.fromCharCode(b); // encode trailing WS
    } else if (b >= 0x21 && b <= 0x7e && b !== 0x3d) {
      token = String.fromCharCode(b); // printable ASCII except '='
    } else {
      token = hex(b); // '=', control, or 8-bit byte
    }
    if (lineLen + token.length > 75) {
      out += '=\r\n'; // soft wrap (leave room so the line stays ≤76)
      lineLen = 0;
    }
    out += token;
    lineLen += token.length;
  }
  return out;
}

function buildMime(args: {
  to: string;
  subject: string;
  text: string;
  fromName: string;
  fromEmail: string;
  replyTo: string;
}): string {
  const { to, subject, text, fromName, fromEmail, replyTo } = args;
  const headers = [
    `From: ${encodeHeader(fromName)} <${sanitizeHeaderValue(fromEmail)}>`,
    `To: ${sanitizeHeaderValue(to)}`,
    `Reply-To: ${sanitizeHeaderValue(replyTo)}`,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
  ].join('\r\n');
  // CRLF headers + blank-line separator; body is quoted-printable encoded.
  return `${headers}\r\n\r\n${quotedPrintableEncode(text)}`;
}

export interface GmailSendInput {
  to: string;
  subject: string;
  text: string;
}

/**
 * Send a true text/plain email as GMAIL_SEND_AS via the Gmail API.
 * Returns the Gmail message id. Throws on failure (caller logs + reports).
 */
export async function sendGmailEmail(input: GmailSendInput): Promise<{ id: string }> {
  if (!isGmailSendConfigured()) {
    throw new Error('Gmail send is not configured (missing service-account env).');
  }
  const sendAs = process.env.GMAIL_SEND_AS!;
  const fromName = process.env.HELM_FROM_NAME ?? 'Nick Rini';
  const token = await getAccessToken();

  const mime = buildMime({
    to: input.to,
    subject: input.subject,
    text: input.text,
    fromName,
    fromEmail: sendAs,
    replyTo: sendAs,
  });

  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: base64Url(mime) }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail send failed (${res.status}): ${detail}`);
  }
  const json = (await res.json()) as { id: string };
  return { id: json.id };
}
