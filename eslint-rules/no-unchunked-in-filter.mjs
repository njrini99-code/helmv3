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
          context.report({ node: arg, messageId: 'unchunked' });
          return;
        }

        if (arg.type === 'ArrayExpression') {
          // A short literal of constants (status enums, fixed filters) is not
          // the failure mode this rule exists for.
          if (arg.elements.length <= 3) return;
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
