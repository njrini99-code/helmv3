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
 * THE BLIND SPOT THIS RULE USED TO HAVE (found via C16, 2026-08-08)
 *
 * The original rule only looked at `const { data } = await …`. It said nothing
 * about a binding that holds the whole result:
 *
 *     const [coachTeamId, playerTeamResult] = await Promise.all([...]);
 *     teamId = coachTeamId || playerTeamResult.data?.team_id || null;
 *
 * `.error` is never touched, so this is the SAME defect wearing a different
 * shape — and it shipped: the golf calendar rendered an empty season for a
 * player whose membership read failed, inside a try/catch written to guard
 * exactly that, which was dead because supabase-js resolves rather than throws.
 * The ratchet could not see it, so the count said the file was clean.
 *
 * "The error is still reachable" is only a defence if somebody reaches it. So
 * a whole-result binding is now flagged too — but only when `.data` is read
 * and `.error` is read NOWHERE on that same binding. Touching `.error` at all
 * satisfies the rule; what to do about it stays the author's call.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 *
 *   - `const { data, error } = ...`      — the error is bound; author's call
 *   - a result binding whose `.error` is read anywhere in scope
 *   - a result binding whose `.data` is never read either (nothing is asserted)
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
      uncheckedResult:
        'This reads `.data` off a Supabase result but never touches `.error`. supabase-js RESOLVES failures as `{ data: null, error }` rather than throwing — including inside `Promise.all`, where a surrounding try/catch never fires — so a read that FAILED becomes a read that FOUND NOTHING. That is how the golf calendar rendered an empty season for a rostered player (C16). Read `.error` and decide explicitly. See eslint-rules/no-unchecked-supabase-error.mjs.',
      uncheckedError:
        'This destructures `data` but not `error`. supabase-js RESOLVES failures as `{ data: null, error }` rather than throwing, so a read that FAILED becomes a read that FOUND NOTHING — and the UI states that as fact ("no team", "no entries yet", a 404, a leaderboard with no scores). Bind `error` and decide explicitly: throw, log, or degrade. See eslint-rules/no-unchecked-supabase-error.mjs.',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /** Which of `.data` / `.error` are read off this binding, anywhere in scope. */
    function propertiesReadOn(identifierNode) {
      const scope = sourceCode.getScope
        ? sourceCode.getScope(identifierNode)
        : context.getScope();
      const variable =
        scope.variables.find((v) => v.name === identifierNode.name) ??
        scope.through.map((r) => r.resolved).find((v) => v && v.name === identifierNode.name);
      if (!variable) return null;

      const read = new Set();
      for (const ref of variable.references) {
        const parent = ref.identifier.parent;
        if (parent?.type !== 'MemberExpression') continue;
        if (parent.object !== ref.identifier) continue;
        const name = parent.computed
          ? parent.property?.type === 'Literal'
            ? parent.property.value
            : null
          : parent.property?.name;
        if (name === 'data' || name === 'error') read.add(name);
      }
      return read;
    }

    /** Flag a whole-result binding whose `.data` is used but `.error` never is. */
    function checkResultBinding(identifierNode) {
      const read = propertiesReadOn(identifierNode);
      // No resolvable variable, or nothing read off it at all — assert nothing.
      if (!read || !read.has('data') || read.has('error')) return;
      context.report({ node: identifierNode, messageId: 'uncheckedResult' });
    }

    return {
      VariableDeclarator(node) {
        if (!node.init) return;
        const init = node.init.type === 'AwaitExpression' ? node.init.argument : null;
        if (!init) return;

        // Shape 1 — `const { data } = await supabase.from(...)...`
        if (node.id.type === 'ObjectPattern') {
          if (!isSupabaseQueryChain(init)) return;

          const keys = node.id.properties
            .filter((p) => p.type === 'Property' && p.key?.type === 'Identifier')
            .map((p) => p.key.name);

          if (keys.includes('data') && !keys.includes('error')) {
            context.report({ node: node.id, messageId: 'uncheckedError' });
          }
          return;
        }

        // Shape 2 — `const result = await supabase.from(...)...`
        if (node.id.type === 'Identifier') {
          if (!isSupabaseQueryChain(init)) return;
          checkResultBinding(node.id);
          return;
        }

        // Shape 3 — `const [a, b] = await Promise.all([...])`, the shape that
        // hid C16. Each element is matched positionally against the array
        // literal so only the genuinely-Supabase slots are considered.
        if (node.id.type === 'ArrayPattern') {
          const isPromiseAll =
            init.type === 'CallExpression' &&
            init.callee?.type === 'MemberExpression' &&
            init.callee.object?.name === 'Promise' &&
            init.callee.property?.name === 'all';
          if (!isPromiseAll) return;

          const args = init.arguments?.[0];
          if (args?.type !== 'ArrayExpression') return;

          node.id.elements.forEach((element, index) => {
            if (element?.type !== 'Identifier') return;
            let settled = args.elements[index];
            // `cond ? supabase.from(...)... : Promise.resolve(...)` is common
            // here; either branch being a query chain makes the slot a result.
            const branches =
              settled?.type === 'ConditionalExpression'
                ? [settled.consequent, settled.alternate]
                : [settled];
            if (!branches.some((b) => b && isSupabaseQueryChain(b))) return;
            checkResultBinding(element);
          });
        }
      },
    };
  },
};
