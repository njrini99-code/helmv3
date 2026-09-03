/**
 * no-healthy-value-on-error — a surface's "everything is fine" answer must not
 * be its "I could not read this" answer.
 *
 * WHY THIS RULE EXISTS (eight of these in one program, 2026-09-03)
 *
 * `no-empty-collection-on-error` catches the permissive twin: an error branch
 * answered with an empty collection, so a dropped read GRANTS what the guard
 * exists to withhold. This is the same mistake pointed at an operator instead
 * of a user. The error is bound, or the nullable is coalesced, and the answer
 * is a value that reads as HEALTHY:
 *
 *     signals.db_unavailable = known(platform.data.dbUp === 0, …);
 *     //                             ^ null → false → "not down" → CLEAR
 *
 * A P0 rule named "Database unavailable" rendered green over a metric that was
 * never in the scrape. Every instance found in the Supabase observability
 * program had this shape:
 *
 *   - a null database-up metric compared with `=== 0`, so absent read as up
 *   - `activeUsersToday: activeToday.count ?? 0` on a KPI type that cannot
 *     express unknown, so a failed user count painted a node "Active, 0 today"
 *     with a solid evidence-complete ring
 *   - open-incident counts derived from a capped fetch with no truncation
 *     flag, so a saturated ceiling rendered as a real total
 *   - a Storage authorization denial defaulting to `expectedness: 'expected'`,
 *     which routes to a bucket that emits no metric, no log and no record
 *   - a sustained-saturation rule evaluated against ONE sample when
 *     "sustained" is defined over consecutive samples, so it reported clear
 *     on every render while being structurally unable to fire
 *
 * In every case the value that means "nobody read this" was the same value
 * that means "this is fine" — indistinguishable to the code, to the screen,
 * and to the person on call.
 *
 * WHAT IT FLAGS
 *
 * Returning, or assigning, a HEALTH-SHAPED literal directly from a branch
 * guarded on an error-shaped identifier: `0`, and the strings this codebase
 * uses for a good state (`ok`, `clear`, `healthy`, `success`, `fresh`,
 * `reading`, `expected`, `up`, `green`, `pass`, `passing`).
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 *
 *   - returning `null` / `undefined` — that is the fix, not the bug: it makes
 *     the caller decide, and it is what every corrected site above now does
 *   - throwing, or returning a typed failure/unknown result
 *   - `unknown`, `blind`, `degraded`, `stale`, `error`, `unconfigured` — those
 *     are honest answers to a failed read
 *   - `false`, in any position. In a permission path it means DENY and is the
 *     correct fail-closed answer; see the note on isHealthyLiteral below
 *   - a health-shaped value returned OUTSIDE an error branch, which is the
 *     ordinary case and most of this codebase
 *   - `?? 0` on its own. Measured 2026-09-03: 1,675 sites in `src`, 73 of the
 *     `.count ?? 0` shape alone, and the great majority are legitimate because
 *     the error was already checked — `dashboard-data.ts` is the model:
 *     `rosterCountError ? null : (rosterCountResult.count ?? 0)`. Flagging the
 *     coalesce alone would drown the signal, so this rule takes the narrow,
 *     high-confidence shape and leaves the wide one to review.
 *
 * A legitimate health-on-error does exist — a genuinely optional signal whose
 * absence really is benign. Those should say so with an eslint-disable and a
 * reason, which is the whole point: make the choice visible instead of
 * accidental.
 */

/** The strings this codebase uses to mean "this is fine". */
const HEALTHY_STRINGS = new Set([
  'ok',
  'clear',
  'healthy',
  'success',
  'succeeded',
  'fresh',
  'reading',
  'expected',
  'up',
  'green',
  'pass',
  'passing',
  'active',
  'complete',
]);

/** `error`, `readError`, `fooError`, `err` — the shapes this codebase uses.
 *  Deliberately the same predicate as no-empty-collection-on-error.mjs, so
 *  the two rules agree on what an error branch is. */
function looksLikeErrorTest(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return /(^|[a-z])error$|^err$/i.test(node.name);
  if (node.type === 'LogicalExpression') {
    return looksLikeErrorTest(node.left) || looksLikeErrorTest(node.right);
  }
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
    return /(^|[a-z])error$/i.test(node.property.name);
  }
  return false;
}

/** `0` or a known good-state string — with `-0` and `+0` folded in.
 *
 *  `false` is DELIBERATELY NOT HERE. It is ambiguous in exactly the places
 *  that matter most: in a permission path `return false` means DENY, which is
 *  the correct fail-closed answer, and in a reachability probe
 *  `return { reachable: false }` is an honest "could not reach". Both were
 *  flagged by the first draft of this rule — `require-super-admin.ts` and
 *  `verify-player-access.ts` — and both were right as written. A rule that
 *  pressures someone to "fix" correct fail-closed security code is worse than
 *  no rule, so `false` is left to review and this rule keeps only the
 *  unambiguous shapes. */
function isHealthyLiteral(node) {
  if (!node) return false;
  if (node.type === 'UnaryExpression' && (node.operator === '-' || node.operator === '+')) {
    return isHealthyLiteral(node.argument);
  }
  if (node.type !== 'Literal') return false;
  if (node.value === 0) return true;
  if (typeof node.value === 'string') return HEALTHY_STRINGS.has(node.value.toLowerCase());
  return false;
}

/** An object literal is health-shaped when EVERY value it sets is. Catches
 *  `if (error) return { count: 0 }` without flagging a shape that already
 *  carries an honest `status: 'error'` alongside. Since `false` is not a
 *  health literal (see above), `{ reachable: false }` is correctly ignored. */
function isHealthyObject(node) {
  if (!node || node.type !== 'ObjectExpression') return false;
  const values = node.properties
    .filter((p) => p.type === 'Property' && p.value)
    .map((p) => p.value);
  if (values.length === 0) return false;
  return values.every((v) => isHealthyLiteral(v));
}

function isHealthyAnswer(node) {
  return isHealthyLiteral(node) || isHealthyObject(node);
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Do not answer a failed read with a health-shaped value — "I could not read this" must be distinguishable from "this is fine".',
    },
    messages: {
      healthyOnError:
        'This answers a FAILED READ with a value that reads as healthy (0, or a good-state string). An operator cannot tell it apart from a genuinely good state, and neither can the surface rendering it — that is how a P0 renders green over a metric nobody read. Return null (or an explicit unknown/blind/degraded state) so the caller must decide. If a health-shaped value really is right here, add an eslint-disable saying why. See eslint-rules/no-healthy-value-on-error.mjs.',
    },
    schema: [],
  },

  create(context) {
    /** Report health-shaped answers found directly in an error branch. */
    function checkBranch(branch) {
      if (!branch) return;
      const statements = branch.type === 'BlockStatement' ? branch.body : [branch];
      for (const stmt of statements) {
        if (stmt.type === 'ReturnStatement') {
          if (isHealthyAnswer(stmt.argument)) {
            context.report({ node: stmt, messageId: 'healthyOnError' });
          }
          continue;
        }
        // `if (error) { someSignal = 0; }` — the assignment form, which is how
        // the alert-policy defects were written rather than as a return.
        if (
          stmt.type === 'ExpressionStatement' &&
          stmt.expression?.type === 'AssignmentExpression' &&
          stmt.expression.operator === '=' &&
          isHealthyAnswer(stmt.expression.right)
        ) {
          context.report({ node: stmt, messageId: 'healthyOnError' });
        }
      }
    }

    return {
      IfStatement(node) {
        if (!looksLikeErrorTest(node.test)) return;
        checkBranch(node.consequent);
      },
    };
  },
};
