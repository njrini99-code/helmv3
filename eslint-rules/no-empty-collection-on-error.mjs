/**
 * no-empty-collection-on-error — a guard's "allow" answer must not be its
 * "the read failed" answer.
 *
 * WHY THIS RULE EXISTS (three of these in one night, 2026-08-08/09)
 *
 * The unchecked-read ratchet catches `const { data } = await …` — an error
 * nobody bound. It cannot catch the opposite mistake, where the error IS bound
 * and then answered with a permissive empty value:
 *
 *     const { data, error } = await supabase.from('baseball_player_settings')…
 *     if (error) return new Set();          // ← nobody is private
 *
 * The caller applies that set as `!privateIds.has(id)`, so an empty set filters
 * NOBODY. A dropped connection surfaces players who explicitly opted out.
 *
 * The same shape appeared three times:
 *   - Compare's privacy filter (`return new Set()`)
 *   - attributeClassEvents' owner index (empty ⇒ show every teammate's classes)
 *   - addSecondTeam's duplicate-gender guard (`?? []` ⇒ no conflict found)
 *
 * In every case the empty collection was ALSO the value that means "allow", so
 * the failure and the permission were indistinguishable — to the code and to
 * the reader.
 *
 * WHAT IT FLAGS
 *
 * Returning an empty collection literal (`[]`, `new Set()`, `new Map()`, `{}`)
 * directly from a branch guarded on an error-shaped identifier.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 *
 *   - returning `null`/`undefined` — that is the fix, not the bug: it forces
 *     the caller to decide
 *   - throwing, or returning a typed failure result
 *   - an empty collection returned OUTSIDE an error branch — that is an honest
 *     empty, which this codebase is full of and should be
 *
 * A legitimate empty-on-error does exist (a truly additive list where empty is
 * meaningless). Those should say so with an eslint-disable and a reason,
 * which is the whole point: make the choice visible instead of accidental.
 */

const EMPTY_COLLECTION_CTORS = new Set(['Set', 'Map', 'WeakSet', 'WeakMap']);

/** `error`, `readError`, `fooError`, `err` — the shapes this codebase uses. */
function looksLikeErrorTest(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return /(^|[a-z])error$|^err$/i.test(node.name);
  // `if (a || b)` / `if (a && b)` — any operand being error-shaped counts.
  if (node.type === 'LogicalExpression') {
    return looksLikeErrorTest(node.left) || looksLikeErrorTest(node.right);
  }
  // `if (result.error)`
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') {
    return /(^|[a-z])error$/i.test(node.property.name);
  }
  return false;
}

/** `[]`, `{}`, `new Set()`, `new Map()` — with no arguments/elements. */
function isEmptyCollection(node) {
  if (!node) return false;
  if (node.type === 'ArrayExpression') return node.elements.length === 0;
  if (node.type === 'ObjectExpression') return node.properties.length === 0;
  if (node.type === 'NewExpression') {
    return (
      node.callee?.type === 'Identifier' &&
      EMPTY_COLLECTION_CTORS.has(node.callee.name) &&
      (node.arguments?.length ?? 0) === 0
    );
  }
  return false;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Do not return an empty collection from an error branch — a guard's permissive answer must be distinguishable from a failed read.",
    },
    messages: {
      failOpen:
        'This returns an empty collection because a read FAILED. If callers treat empty as "nothing to exclude" — `!set.has(id)`, `.length === 0`, `?? []` — then a dropped connection silently grants what the guard exists to withhold. Return null (or throw) so the caller must decide. If empty really is right here, add an eslint-disable saying why. See eslint-rules/no-empty-collection-on-error.mjs.',
    },
    schema: [],
  },

  create(context) {
    /** Report `return <empty>` statements found directly in an error branch. */
    function checkBranch(branch) {
      if (!branch) return;
      const statements =
        branch.type === 'BlockStatement' ? branch.body : [branch];
      for (const stmt of statements) {
        if (stmt.type !== 'ReturnStatement') continue;
        if (!isEmptyCollection(stmt.argument)) continue;
        context.report({ node: stmt, messageId: 'failOpen' });
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
