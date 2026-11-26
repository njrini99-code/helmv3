/**
 * Errors explained for the admin: the words the person saw (cleaned out of the catalog's spec prose), and why it most
 * likely failed with what to do next (from the server code, else the message, else only the kind).
 *
 * The catalog's "they see" and "meaning" are written for builders: long sentences, backticks, GAP-/D- references and
 * design notes ("a brick medallion, no card"). The Bridge shows a person's words, so this module keeps only the quoted
 * message a person read, or the first plain sentence of the meaning. `explain.test.ts` runs every id in the real
 * bridge-graph.json through it.
 *
 * Pure: no server imports. Never put `message` (raw server text, may hold ids) into a copy report.
 */
import { describeServerCode, type CauseOwner } from '@/lib/admin/server-codes';

export const HEADLINE_MAX = 120;

/** Straight quotes to typographic ones; one apostrophe (’) everywhere. */
export function normalizeQuotes(s: string): string {
  return s
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/(^|[\s([—–-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([—–-])'/g, '$1‘')
    .replace(/'/g, '’');
}

/** Spec references that mean nothing to a reader: (GAP-S-31), (D-66), (row 62), (owner, 2026-11-14), (B10.3). */
const SPEC_PAREN = /\s*\((?:[^()]*?(?:GAP-|\b[DRF]-\d|\bB\d+\.\d|\brow \d|owner,|`|WebKit|isClubhouseFor|launch readiness)[^()]*)\)/g;

/** A cut line must not end inside a bracket: drop an unclosed "(..." tail. */
function closeParens(s: string): string {
  const open = s.lastIndexOf('(');
  if (open !== -1 && s.indexOf(')', open) === -1) return s.slice(0, open).replace(/[\s,;:—–-]+$/, '');
  return s;
}

function cutAt(s: string, max: number): string {
  if (s.length <= max) return s;
  for (const sep of ['. ', '; ', ': ', ', ', ' — ']) {
    const i = s.lastIndexOf(sep, max - 1);
    if (i >= 40) return s.slice(0, i).trim();
  }
  const sp = s.lastIndexOf(' ', max - 2);
  return `${s.slice(0, sp > 40 ? sp : max - 1).trim()}…`;
}

/** Builder prose to one readable line: spec references and backticks out, first sentence, capped. */
export function plainLine(s: string | null | undefined, max = HEADLINE_MAX): string | null {
  if (!s) return null;
  let t = s
    .replace(SPEC_PAREN, '')
    .replace(/`/g, '')
    // A code call (chLogServer(“hub”, {read})) reads as its name; a template slot ({id}) as an ellipsis.
    .replace(/\b([a-z][A-Za-z0-9_.]*)\([^()]*\)/g, '$1')
    .replace(/\{[^{}]*\}/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  // Not a sentence (a bare URL fragment such as "?task={id}"): no headline.
  if (!/^[A-Za-z0-9“"‘']/.test(t)) return null;
  const firstSentence = /^(.{20,}?[.!?])\s+[A-Z“"]/.exec(t);
  if (firstSentence?.[1] && t.length > max) t = firstSentence[1];
  t = t.replace(/[.\s]+$/, '');
  t = normalizeQuotes(closeParens(cutAt(t, max)));
  return t.length ? t : null;
}

/**
 * The words a person actually read, when the catalog row starts with them in quotes ("Couldn't mark your notifications
 * read", Retry; ...). Prose that only mentions a label in quotes ("‹ More") is not a message and returns null.
 */
export function sawText(theySee: string | null | undefined): string | null {
  if (!theySee) return null;
  const m = /^\s*["“]([^"”]{2,160})["”]/.exec(theySee);
  if (!m) return null;
  const text = m[1]!.trim();
  if (/[{}`]/.test(text)) return null;
  return normalizeQuotes(closeParens(cutAt(text, HEADLINE_MAX)));
}

/** The headline for a failure: what they saw (quoted), else the row's meaning in one plain line, else the kind. */
export function failureHeadline(i: { theySee: string | null; meaning: string | null; code: string | null; kind: string }): { text: string; quoted: boolean } {
  const saw = sawText(i.theySee);
  if (saw) return { text: saw, quoted: true };
  const meaning = plainLine(i.meaning);
  if (meaning) return { text: meaning, quoted: false };
  const what = i.kind === 'crash' ? 'A section crashed' : 'An action failed';
  return { text: i.code ? `${what} (${i.code})` : `${what}, with no code`, quoted: false };
}

// ---------------------------------------------------------------------------
// Why it failed, and what to do
// ---------------------------------------------------------------------------

export type CauseBasis = 'server code' | 'message' | 'kind' | 'nothing';

export interface Explanation {
  /** Two or three words, for a chip. */
  label: string;
  owner: CauseOwner;
  /** One or two sentences: what most likely happened. */
  why: string;
  /** How we know: the server code, the wording of the message, only the kind of failure, or nothing. */
  basis: CauseBasis;
  /** "from server code 42501", "from the error message", ... For the reader, never a guess dressed as fact. */
  basisWords: string;
  steps: readonly string[];
}

interface MessageRule {
  test: RegExp;
  label: string;
  owner: CauseOwner;
  why: string;
  steps: readonly string[];
}

const REPLAY = 'Replay the session to see what the person did just before.';

/** Order matters: the first match wins. Patterns come from real error_logs wording (Safari says "Load failed"). */
const MESSAGE_RULES: readonly MessageRule[] = [
  {
    test: /chunkloaderror|loading chunk|failed to find server action|dynamically imported module|importing a module script failed/i,
    label: 'Old app version',
    owner: 'app',
    why: 'The page was built for an earlier release and asked for code the server no longer has. A reload fixes it for the person.',
    steps: ['Nothing to fix if it follows a deploy: it stops once open pages reload.', 'If it keeps happening long after a deploy, check the app’s “newer version is ready” prompt.'],
  },
  {
    test: /jwt expired|you must be signed in|not signed in|auth session missing|refresh token|invalid jwt|\bunauthori[sz]ed\b|\b401\b/i,
    label: 'Signed out',
    owner: 'sign-in',
    why: 'The person’s sign-in had expired or was missing when the action ran.',
    steps: ['Nothing to fix if it is rare: the app signs them in again.', REPLAY, 'If many people hit it together, check token refresh on that platform.'],
  },
  {
    test: /forbidden|\b403\b|permission denied|row-level security|not allowed|insufficient privilege/i,
    label: 'Not allowed',
    owner: 'access',
    why: 'The server refused because this person is not allowed to do this (a role, team or row rule).',
    steps: ['Check the person’s role and team on this error against what the action needs.', 'Open the Fix pack for the table and policy.', 'Run npm run test:rls if a policy changed recently.'],
  },
  {
    test: /too many requests|\b429\b|rate limit/i,
    label: 'Rate limited',
    owner: 'server',
    why: 'The server or a provider refused because too many requests came in at once.',
    steps: [REPLAY, 'If it repeats, the action is firing in a loop or without a debounce.'],
  },
  {
    test: /model error|tool_use|anthropic|overloaded_error|\b529\b|assistant turn ended/i,
    label: 'AI model error',
    owner: 'server',
    why: 'The AI model call failed or ended early; the message says which.',
    steps: ['Read the message on the Server tab for the model’s own error.', 'If it names a request shape (such as duplicate tool ids), the turn runner built a bad request.'],
  },
  {
    test: /channel_error|channel error|realtime|websocket/i,
    label: 'Live updates dropped',
    owner: 'network',
    why: 'The live-update channel closed; the page stops updating until it reconnects.',
    steps: ['Usually the phone slept or changed network; it reconnects by itself.', 'If many sessions drop at once, check the Supabase realtime status.'],
  },
  {
    test: /load failed|failed to fetch|networkerror|network request failed|network connection was lost|appears to be offline|fetch failed|econnreset|err_network/i,
    label: 'Connection dropped',
    owner: 'network',
    why: 'The request never got an answer: the connection dropped or the phone was offline. “Load failed” is Safari’s wording for this.',
    steps: ['Nothing to fix if it is rare: it is the person’s connection.', 'If many people hit it in the same minute, the server was unreachable: check Speed and the release.'],
  },
  {
    test: /timeouterror|timed out|timeout|aborterror|operation was aborted|stopped waiting/i,
    label: 'Gave up waiting',
    owner: 'timeout',
    why: 'The request took too long and was cancelled before it answered.',
    steps: ['Open Speed for the slowest queries and pages in this window.', REPLAY],
  },
  {
    test: /\b50[0234]\b|internal server error|bad gateway|service unavailable|gateway timeout/i,
    label: 'Server error',
    owner: 'server',
    why: 'The server failed while handling the request.',
    steps: ['Check the error log and Sentry for the same minute: the server-side error has the cause.', REPLAY],
  },
  {
    test: /relation .{1,80} does not exist|column .{1,80} does not exist|could not find the .{1,40} in the schema cache|could not find the function/i,
    label: 'Schema missing',
    owner: 'migration',
    why: 'The database does not have a table, column or function the action uses.',
    steps: [
      'Compare what the action uses with src/lib/types/database.ts (the live schema).',
      'Check supabase/migrations/HELD.md: a held or unapplied migration is the usual cause.',
    ],
  },
  {
    test: /not found|was deleted|no rows|does not exist|\b404\b/i,
    label: 'Not found',
    owner: 'data',
    why: 'What the action pointed at was not there, usually deleted a moment earlier or a stale link.',
    steps: [REPLAY, 'If it was not deleted, the action is sending the wrong id.'],
  },
];

export interface FailureFacts {
  kind: string;
  outcome: string | null;
  serverCode: string | null;
  /** The raw message (admin only; never copied out). */
  message: string | null;
}

/** Why a failure most likely happened, how we know, and what to check. */
export function explainFailure(f: FailureFacts): Explanation {
  const code = describeServerCode(f.serverCode);
  if (code && code.match !== 'none') {
    return {
      label: code.label,
      owner: code.owner,
      why: code.meaning,
      basis: 'server code',
      basisWords: code.match === 'exact' ? `from ${code.source} code ${f.serverCode}` : `from the class of ${code.source} code ${f.serverCode}`,
      steps: code.steps,
    };
  }
  const msg = f.message ?? '';
  const rule = msg ? MESSAGE_RULES.find((r) => r.test.test(msg)) : undefined;
  if (rule) return { label: rule.label, owner: rule.owner, why: rule.why, basis: 'message', basisWords: 'from the wording of the error message', steps: rule.steps };
  if (code) return { label: code.label, owner: 'unknown', why: code.meaning, basis: 'server code', basisWords: `${code.source} code ${f.serverCode} is not in the list yet`, steps: code.steps };
  if (f.kind === 'crash') {
    return {
      label: 'Section crashed',
      owner: 'app',
      why: 'Part of the page threw while drawing, so the person saw the crash screen instead of it.',
      basis: 'kind',
      basisWords: 'only that it crashed: a crash carries no server code',
      steps: [REPLAY, 'Open the Fix pack: it names the component and file.', 'If it is new in this release, the release is the first place to look (Ship).'],
    };
  }
  return {
    label: 'Cause not reported',
    owner: 'unknown',
    why: 'The action failed without a server code or a message that names a cause.',
    basis: 'nothing',
    basisWords: msg ? 'the message does not name a cause' : 'no server code or message came back',
    steps: [REPLAY, 'Open the Fix pack: the action’s handler should send its server code with the failure.'],
  };
}

/** The tone a cause chip takes: access and data are the app's to fix, network and sign-in are usually the person's. */
export const OWNER_TONE: Readonly<Record<CauseOwner, 'bad' | 'watch' | 'muted'>> = {
  access: 'bad',
  migration: 'bad',
  data: 'watch',
  database: 'watch',
  timeout: 'watch',
  network: 'muted',
  app: 'bad',
  server: 'bad',
  'sign-in': 'muted',
  person: 'muted',
  unknown: 'muted',
};

export const OWNER_WORDS: Readonly<Record<CauseOwner, string>> = {
  access: 'Access rule',
  migration: 'Schema',
  data: 'Data',
  database: 'Database',
  timeout: 'Speed',
  network: 'Connection',
  app: 'App',
  server: 'Server',
  'sign-in': 'Sign-in',
  person: 'Person',
  unknown: 'Unknown',
};
