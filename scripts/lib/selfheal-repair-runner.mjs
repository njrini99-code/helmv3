// scripts/lib/selfheal-repair-runner.mjs — the outer contract around a Repair run.
//
// WHAT THIS OWNS, AND WHAT IT DOES NOT
//
//   Claude owns the NORMAL final heartbeat. It knows what it did — candidates,
//   confirmed, corrected, PRs opened — and this file must never invent any of
//   those numbers.
//
//   The outer runner owns exactly one thing: recording that the RUN ITSELF
//   failed, in the case where Claude never got far enough to say so.
//
// WHY IT IS NEEDED
//
//   The 06:40 scheduled Repair run hung for 30 minutes, was killed by the
//   watchdog, and wrote NOTHING. `/admin/jobs` therefore could not tell that
//   from a laptop that was asleep — which is the exact confusion the heartbeat
//   exists to prevent, reproduced at the layer above it.
//
// THE RULE THAT MAKES THIS SAFE
//
//   A fallback row is written ONLY after a SUCCESSFUL read proves no heartbeat
//   exists for this run. If the heartbeat store cannot be read, the answer is
//   UNKNOWN and nothing is written:
//
//       heartbeat query failed   !=   heartbeat absent
//
//   Writing on an unreadable store would manufacture failures during a
//   Supabase outage — inventing bad news is no better than inventing good.
//
//   Identity is a per-run UUID (`HELM_REPAIR_RUN_ID`), not a timestamp window.
//   Timestamps cannot distinguish "this run" from "a run that happened to
//   overlap", and inferring absence from a time range is how a healthy run gets
//   a spurious failure row.

/** @typedef {{kind:'heartbeat-present', childExit:number}
 *          | {kind:'fallback-written', childExit:number, timeout:boolean}
 *          | {kind:'fallback-failed', childExit:number, error:string}
 *          | {kind:'heartbeat-state-unknown', childExit:number, error:string}} RepairRunnerResult */

/** timeout(1)'s code, and what scripts/run-bounded.mjs exits with. */
export const TIMEOUT_EXIT_CODE = 124;

// Generic secret-shaped patterns, redacted before anything captured from a
// child process is ever written toward a heartbeat row. Style matches
// scripts/__tests__/scripts-no-committed-secrets.test.mjs's
// PASSWORD_LITERAL_ASSIGNMENT — deliberately generic regexes, never a copy of
// a real secret literal.
// Each pattern is paired with `keyGroup`, told explicitly rather than
// inferred from the replace callback's arguments — see the note on
// `redactSecrets` below for why inference was the bug.
const SECRET_PATTERNS = [
  // JWT-shaped: header.payload.signature, each segment base64url. No
  // capturing group: the whole match is the secret, so it is fully replaced.
  { regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, keyGroup: false },
  // Bare prefix-shaped credentials that appear WITHOUT a KEY=/TOKEN= assignment
  // (a Supabase sb_secret_/sb_publishable_/sbp_ key, a GitHub ghp_/gho_/github_pat_
  // token, an sk-/sk_live_/sk_test_ API key, a Slack xox* token, or the value after
  // "Bearer "). The child prints these inside error messages and URLs, not as
  // assignments, so the assignment pattern below never sees them. No capturing
  // group: the whole match is the secret.
  {
    regex: /\b(?:sb_(?:secret|publishable)_[A-Za-z0-9_-]{8,}|sbp_[A-Za-z0-9]{8,}|gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|sk-[A-Za-z0-9_-]{16,}|sk_(?:live|test)_[A-Za-z0-9]{8,}|xox[abpr]-[A-Za-z0-9-]{10,})\b/g,
    keyGroup: false,
  },
  { regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, keyGroup: false },
  // key/token/secret/password assignment-like patterns: KEY=..., "token": "...", key: '...'.
  // Group 1 is the key name, kept for context; the value itself is redacted.
  {
    regex: /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PW)[A-Za-z0-9_]*)\s*[:=]\s*(["'`]?)([^\s"'`,}]{6,})\2/gi,
    keyGroup: true,
  },
];

/**
 * Redact anything that looks like a JWT, API key, token, secret, or password
 * out of arbitrary text. Used on a child process's captured stdout/stderr
 * before it is ever written into a heartbeat row — that text can contain
 * whatever the child printed, including a leaked credential.
 *
 * Deliberately generic and over-inclusive: a false-positive redaction costs
 * nothing here, a missed one leaks a secret into `background_job_logs`.
 *
 * Each pattern in `SECRET_PATTERNS` carries an explicit `keyGroup` flag
 * rather than having its replace-callback branch on whether a capture group
 * argument is truthy. `String.replace`'s callback signature is
 * `(match, ...capturedGroups, offset, wholeString)` — for a pattern with
 * ZERO capturing groups (the JWT pattern), the argument right after `match`
 * IS the numeric match offset, not a capture group. A truthiness check like
 * `group1 ? ... : '[REDACTED]'` then treats that offset as a present group
 * for any match not at index 0, producing a mangled `"<offset>=[REDACTED]"`
 * instead of a clean `"[REDACTED]"` — and the offset in that leaked text has
 * no operational meaning at all. Keying replacement behavior off the
 * pattern's own declared shape, instead of arity-guessing at the call site,
 * makes that class of bug impossible regardless of how many groups a future
 * pattern adds.
 *
 * @param {string} text
 * @returns {string}
 */
export function redactSecrets(text) {
  if (!text) return text;
  let out = text;
  for (const { regex, keyGroup } of SECRET_PATTERNS) {
    out = out.replace(regex, keyGroup ? (_match, key) => `${key}=[REDACTED]` : () => '[REDACTED]');
  }
  return out;
}

/**
 * Keep only the last `maxBytes` bytes of `text` (UTF-8), so a heartbeat's
 * `metadata` column never grows unbounded from a chatty child. The TAIL is
 * kept, not the head, because the reason a run failed is almost always in
 * whatever it printed right before it died.
 *
 * @param {string} text
 * @param {number} [maxBytes]
 * @returns {string}
 */
export function truncateTail(text, maxBytes = 4096) {
  if (!text) return text;
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return text;
  // Slice on the byte boundary, then decode with replacement so a multi-byte
  // UTF-8 character split at the cut point does not throw or corrupt output.
  return buf.subarray(buf.length - maxBytes).toString('utf8');
}

/**
 * Decide what the outer runner should record, given how the child ended.
 *
 * @param {object} input
 * @param {string} input.runId
 * @param {number} input.childExit
 * @param {string} input.startedAt   ISO
 * @param {string} input.completedAt ISO
 * @param {string} [input.childOutputTail] combined stdout+stderr tail captured
 *   from the child, one 4KB tail rather than two separate stdout/stderr
 *   fields — a failed fire is explained by the last thing printed regardless
 *   of which stream it came out on, and a single field is simpler for
 *   `/admin/selfheal` to render. Redacted and truncated here, not by the
 *   caller, so this is the one place that decides what is safe to store.
 * @param {import('./selfheal-repair-runner.mjs').RepairHeartbeatStore} input.store
 * @returns {Promise<RepairRunnerResult>}
 */
export async function reconcileRepairRun({
  runId,
  childExit,
  startedAt,
  completedAt,
  childOutputTail,
  store,
}) {
  const timeout = childExit === TIMEOUT_EXIT_CODE;

  const lookup = await store.findByRunId(runId);

  // UNKNOWN. Never infer absence from a failed read, and never write on it.
  if (!lookup.readable) {
    return { kind: 'heartbeat-state-unknown', childExit, error: lookup.error };
  }

  // Claude wrote its own row. It knows more than this wrapper ever will, and a
  // second row for one run would double-count on every board that reads them.
  if (lookup.found) {
    return { kind: 'heartbeat-present', childExit };
  }

  // A successful read proved there is no row. Even childExit === 0 lands here:
  // exiting cleanly without writing the contract's final heartbeat means the
  // run did not complete its contract, whatever the exit code claimed.
  const errorMessage = timeout
    ? 'runner timeout: the Repair child exceeded its deadline and wrote no heartbeat'
    : childExit === 0
      ? 'child exited 0 without writing the final Repair heartbeat'
      : `child exited ${childExit} without writing the final Repair heartbeat`;

  const write = await store.insertRunnerFailure({
    runId,
    startedAt,
    completedAt,
    durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    childExit,
    timeout,
    errorMessage,
    // Only added when the caller actually captured something — omitting the
    // key entirely (rather than an empty string) keeps historical rows and
    // callers that never pass it shaped exactly as before.
    ...(childOutputTail ? { childOutputTail: truncateTail(redactSecrets(childOutputTail)) } : {}),
  });

  if (!write.ok) {
    // The wrapper could not record its own failure. Say so rather than
    // reporting a fallback that does not exist.
    return { kind: 'fallback-failed', childExit, error: write.error };
  }

  return { kind: 'fallback-written', childExit, timeout };
}
