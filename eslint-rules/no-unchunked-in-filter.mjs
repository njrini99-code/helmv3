/**
 * helm/no-unchunked-in-filter
 *
 * PostgREST filters travel in the URL. `.in('id', ids)` costs ~39 bytes per
 * uuid, and the edge rejects the request past ~22.8 KB (~585 ids) with a bare
 * `400 Bad Request` that looks like a query error, not a size limit — see
 * `.claude/rules/database.md`. `chunkIds` (src/lib/supabase/chunk-ids.ts,
 * `ID_CHUNK_SIZE = 200`) is the proven fix: chunk the id list, loop, and merge.
 *
 * WHAT IT FLAGS
 *
 * A `.in(column, arg)` call where `arg` is an identifier or an array literal
 * that is not itself a call to `chunkIds`/`chunkIds(...)`. It cannot know the
 * runtime size of the list, so it flags the SHAPE that has caused this bug
 * before — an unbounded list handed straight to `.in()` — not a proven
 * violation. That is a call for the ratchet, not for this rule to fix.
 *
 * WHAT IT DELIBERATELY DOES NOT FLAG
 *
 *   - `.in('id', chunkIds(ids)[i])` or any expression whose callee resolves
 *     to `chunkIds` somewhere in the argument tree
 *   - a literal array of primitive values with 3 or fewer elements (status
 *     enums, fixed small filters) — chunking three constants is noise
 *   - `.in(` calls where the second argument is itself a member/call
 *     expression already returning a bounded slice (e.g. `chunk`, `page`)
 *     — heuristically, any argument name containing "chunk" or "page"
 *   - an array literal whose every element is a literal (a fixed enum filter
 *     such as `['proposed', 'active', 'in_progress', 'paused']`), and an
 *     identifier bound by `const` to such a literal (`FAILURE_SEVERITIES`,
 *     optionally `as const`): its size is fixed in the source; an imported
 *     SCREAMING_CASE constant (`INCIDENT_SEVERITIES`) is trusted by name
 *   - an identifier that IS a chunkIds slice: the parameter of a callback
 *     passed to `chunkIds(...).map/flatMap/forEach` or straight to a helper
 *     whose name says it chunks (`chunkedIn((ids) => …)`), or the loop
 *     variable of `for (const ids of chunkIds(...))`
 */

function mentionsChunkHelper(node) {
  if (!node) return false;
  if (node.type === 'CallExpression') {
    const callee = node.callee;
    const name =
      callee?.type === 'Identifier'
        ? callee.name
        : callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier'
          ? callee.property.name
          : null;
    if (name && /chunk/i.test(name)) return true;
    return node.arguments.some(mentionsChunkHelper);
  }
  if (node.type === 'MemberExpression') {
    return mentionsChunkHelper(node.object) || mentionsChunkHelper(node.property);
  }
  return false;
}

function unwrapTs(node) {
  let n = node;
  while (n && (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSTypeAssertion' || n.type === 'TSNonNullExpression')) {
    n = n.expression;
  }
  return n;
}

/** An array literal whose size is fixed in the source: every element a literal. */
function isLiteralArray(node) {
  const n = unwrapTs(node);
  return (
    n?.type === 'ArrayExpression' &&
    n.elements.length > 0 &&
    n.elements.every(
      (el) => el && (el.type === 'Literal' || (el.type === 'TemplateLiteral' && el.expressions.length === 0)),
    )
  );
}

const ITERATORS = new Set(['map', 'flatMap', 'forEach']);

/**
 * Is `fn` a callback that receives one chunk? Either the callback of an
 * iterator over a chunk helper's result (`chunkIds(x).map((ids) => …)`), or a
 * callback handed straight to a chunking helper (`chunkedIn((ids) => …)`).
 */
function isChunkIteratorCallback(fn) {
  const call = fn?.parent;
  if (call?.type !== 'CallExpression' || !call.arguments.includes(fn)) return false;
  const callee = call.callee;
  if (callee?.type === 'Identifier') return /chunk/i.test(callee.name);
  if (callee?.type !== 'MemberExpression' || callee.property?.type !== 'Identifier') return false;
  if (ITERATORS.has(callee.property.name)) return call.arguments[0] === fn && mentionsChunkHelper(callee.object);
  return /chunk/i.test(callee.property.name);
}

/** True when the identifier provably holds a bounded list (see "DOES NOT FLAG" above). */
function isBoundedBinding(context, identifier) {
  let scope = context.sourceCode.getScope(identifier);
  let variable = null;
  while (scope && !variable) {
    variable = scope.set.get(identifier.name) ?? null;
    scope = scope.upper;
  }
  const def = variable?.defs?.[0];
  if (!def || variable.defs.length !== 1) return false;

  // An imported SCREAMING_CASE constant (`INCIDENT_SEVERITIES` from
  // src/lib/admin/severity.ts) is a fixed config list by convention; the rule
  // cannot follow the import, so it trusts the name, as it does `chunk`/`page`.
  if (def.type === 'ImportBinding' && /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(identifier.name)) return true;

  if (def.type === 'Variable') {
    const decl = def.parent; // VariableDeclaration
    if (decl?.kind === 'const' && def.node.id?.type === 'Identifier' && isLiteralArray(def.node.init)) return true;
    const loop = decl?.parent;
    if (loop?.type === 'ForOfStatement' && loop.left === decl && mentionsChunkHelper(loop.right)) return true;
    return false;
  }
  if (def.type === 'Parameter' && def.name?.parent === def.node) {
    return isChunkIteratorCallback(def.node);
  }
  return false;
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require .in() id lists to be chunked with chunkIds before crossing the ~585-id / ~22.8KB PostgREST URL limit',
    },
    schema: [],
    messages: {
      unchunked:
        'This .in() filter is not wrapped by chunkIds — an id list past ~585 entries (~22.8KB) is silently rejected by PostgREST with a bare 400 that looks like a query error. Chunk with chunkIds (src/lib/supabase/chunk-ids.ts) and loop, or confirm the list is bounded well under the limit.',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee?.type !== 'MemberExpression') return;
        if (callee.property?.type !== 'Identifier' || callee.property.name !== 'in') return;
        if (node.arguments.length < 2) return;

        const arg = node.arguments[1];

        // Identifier bound elsewhere in scope — flag unless its own name
        // suggests it is already a bounded slice.
        if (arg.type === 'Identifier') {
          if (/chunk|page/i.test(arg.name)) return;
          if (isBoundedBinding(context, arg)) return;
          context.report({ node: arg, messageId: 'unchunked' });
          return;
        }

        if (arg.type === 'ArrayExpression') {
          // A short literal of constants (status enums, fixed filters) is not
          // the failure mode this rule exists for.
          if (arg.elements.length <= 3) return;
          if (isLiteralArray(arg)) return;
          context.report({ node: arg, messageId: 'unchunked' });
          return;
        }

        // Any other expression (call/member) that already threads through a
        // chunk helper is fine; otherwise leave it alone — the rule only
        // targets the two shapes proven to cause this bug.
        if (mentionsChunkHelper(arg)) return;
      },
    };
  },
};
