/**
 * no-unchecked-supabase-error — a failed read must not become an empty one.
 *
 * WHY THIS RULE EXISTS (2026-08-07 code-red)
 *
 * supabase-js RESOLVES database errors as `{ data: null, error }`. It does not
 * throw. So this:
 *
 *     const { data } = await supabase.from('golf_team_members').select(...)
 *
 * turns a read that FAILED into a read that FOUND NOTHING — and the app then
 * presents that nothing to a user as a fact. Fifteen instances of exactly this
 * were fixed across twelve files in one day. The same root cause reached the
 * founder as a dozen unrelated bug reports, because it wears a different mask
 * at every call site:
 *
 *   - "You haven't joined a team yet. Ask your coach for a join code."
 *     (shown to a player who IS on the roster)
 *   - a silent redirect off the Team page
 *   - a 404 for a player the coach just clicked on their own roster
 *   - a qualifier leaderboard where nobody has posted a score
 *     (coaches pick travel squads off that screen)
 *   - a mandatory announcement that reached zero players, returning success
 *   - "Compute now" offered for a genome that already exists
 *
 * Three of those sat in files where the sibling code path was already guarded
 * correctly — so this is not something people don't know, it is something
 * people miss. That is what a lint rule is for.
 *
 * WHAT IT FLAGS
 *
 * Destructuring `data` from an awaited Supabase query without also binding
 * `error`. Binding `error` is enough to satisfy the rule: deciding what to do
 * with it is a judgement the rule cannot make (throw, log, degrade, or ignore
 * with a comment are all right in different places). The goal is to make the
 * error impossible to overlook, not to dictate the response.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 *
 *   - `const { data, error } = ...`      — the error is bound; author's call
 *   - `const result = await ...`         — result.error is still reachable
 *   - `.rpc()` / non-Supabase awaits that don't look like a query chain
 *
 * Shipped as a warning, matching the other helm/* rules, so it documents the
 * debt without breaking the build on day one.
 */

/** Query-builder terminals that settle a PostgREST request. */
const TERMINALS = new Set(['select', 'single', 'maybeSingle', 'insert', 'update', 'upsert', 'delete', 'rpc']);

/** Walk a member/call chain and report whether it looks like a Supabase query. */
function isSupabaseQueryChain(node) {
  let current = node;
  let sawTerminal = false;
  let sawFrom = false;

  while (current) {
    if (current.type === 'CallExpression') {
      const callee = current.callee;
      if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
        const name = callee.property.name;
        if (TERMINALS.has(name)) sawTerminal = true;
        if (name === 'from' || name === 'rpc') sawFrom = true;
        current = callee.object;
        continue;
      }
      current = callee;
      continue;
    }
    if (current.type === 'MemberExpression') {
      current = current.object;
      continue;
    }
    break;
  }

  // `.from(...)` (or a bare `.rpc(...)`) plus a terminal is the shape we mean.
  return sawFrom && sawTerminal;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require the `error` field to be bound when destructuring `data` from a Supabase query, so a failed read cannot silently render as an empty one.',
    },
    messages: {
      uncheckedError:
        'This destructures `data` but not `error`. supabase-js RESOLVES failures as `{ data: null, error }` rather than throwing, so a read that FAILED becomes a read that FOUND NOTHING — and the UI states that as fact ("no team", "no entries yet", a 404, a leaderboard with no scores). Bind `error` and decide explicitly: throw, log, or degrade. See eslint-rules/no-unchecked-supabase-error.mjs.',
    },
    schema: [],
  },

  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.id?.type !== 'ObjectPattern') return;
        if (!node.init) return;

        // Only awaited expressions — a query builder that is passed around
        // rather than awaited is settled somewhere else.
        const init = node.init.type === 'AwaitExpression' ? node.init.argument : null;
        if (!init) return;
        if (!isSupabaseQueryChain(init)) return;

        const keys = node.id.properties
          .filter((p) => p.type === 'Property' && p.key?.type === 'Identifier')
          .map((p) => p.key.name);

        if (keys.includes('data') && !keys.includes('error')) {
          context.report({ node: node.id, messageId: 'uncheckedError' });
        }
      },
    };
  },
};
