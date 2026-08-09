/**
 * helm/no-unchecked-paginated-read
 *
 * `fetchAllRowsResult` deliberately preserves supabase-js's contract: it
 * resolves to `{ data, error }` and returns `data: null` when the read failed.
 * That makes it exactly as easy to get wrong as a raw query — and harder to
 * SEE wrong, because the wrapper reads like a helper that has already handled
 * things.
 *
 * `const { data } = await fetchAllRowsResult(...)` therefore turns a failed read
 * into an empty list, and the page downstream states that emptiness as a fact:
 * "no trips", "no rounds", a leaderboard of zeroes.
 *
 * The unchecked-Supabase-read ratchet cannot see any of this. It matches on the
 * supabase query itself, and here the query is a callback ARGUMENT to the
 * wrapper — so these call sites sat outside the count entirely, including the
 * golf travel page's itinerary list, whose baseball twin had already been fixed
 * once as a real customer-facing bug (#1404). Fixing the golf one (#1413) moved
 * the reads baseline by 1 instead of 2, which is what exposed the gap.
 *
 * Flagged: destructuring the result WITHOUT binding `error`.
 * Not flagged: binding `error` (whatever you then do with it — that is the
 * other ratchet's job), or assigning the whole result to a name, since the
 * error is still reachable through it.
 */

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require binding `error` when destructuring a fetchAllRowsResult result',
    },
    schema: [],
    messages: {
      unchecked:
        'This destructures only `data` from fetchAllRowsResult, so a FAILED read produces the same empty list an empty table produces — and the UI states it as a fact. Bind `error` and decide what a failure should say.',
    },
  },

  create(context) {
    return {
      VariableDeclarator(node) {
        if (node.init?.type !== 'AwaitExpression') return;

        const call = node.init.argument;
        if (call?.type !== 'CallExpression') return;

        const callee = call.callee;
        const name =
          callee?.type === 'Identifier'
            ? callee.name
            : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
              ? callee.property.name
              : null;
        if (name !== 'fetchAllRowsResult') return;

        // Only a destructure can drop the error on the floor. `const r = await …`
        // keeps `r.error` reachable, so it is not this rule's business.
        if (node.id?.type !== 'ObjectPattern') return;

        const bindsError = node.id.properties.some(
          (p) =>
            (p.type === 'Property' && p.key?.type === 'Identifier' && p.key.name === 'error') ||
            p.type === 'RestElement',
        );
        if (bindsError) return;

        context.report({ node: node.id, messageId: 'unchecked' });
      },
    };
  },
};
