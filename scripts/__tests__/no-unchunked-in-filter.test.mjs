import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import rule from '../../eslint-rules/no-unchunked-in-filter.mjs';

/**
 * Canary for helm/no-unchunked-in-filter, which scripts/audits/supabase-chunk-audit.mjs
 * enforces as a count. The unflagged cases are lists whose size is fixed in the
 * source or that are already a chunkIds slice; the flagged cases are the
 * unbounded shapes the rule exists for, and must stay flagged.
 */

// RuleTester drives the runner itself, so wire its hooks to vitest at module scope.
RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
});

const unchunked = [{ messageId: 'unchunked' }];

ruleTester.run('helm/no-unchunked-in-filter', rule, {
  valid: [
    // Short literal (pre-existing behaviour).
    `sb.from('t').select('id').in('status', ['a', 'b']);`,
    // A literal enum filter of any length.
    `sb.from('t').select('id').in('status', ['proposed', 'active', 'in_progress', 'paused', 'completed']);`,
    // A const bound to a literal array, with or without \`as const\`.
    `const FAILURE = ['error', 'fatal', 'critical', 'warning'] as const;
     function f(sb) { return sb.from('t').select('id').in('severity', FAILURE); }`,
    `const REASONS = ['a', 'b', 'c', 'd'];
     function f(sb) { return sb.from('t').select('id').in('reason', REASONS); }`,
    // An imported SCREAMING_CASE constant list.
    `import { INCIDENT_SEVERITIES } from './severity';
     function f(sb) { return sb.from('t').select('id').in('severity', INCIDENT_SEVERITIES); }`,
    // The callback parameter of chunkIds(...).map / flatMap / forEach.
    `async function f(sb, playerIds) {
       return Promise.all(chunkIds(playerIds).map((ids) => sb.from('t').select('id').in('player_id', ids)));
     }`,
    `async function f(sb, playerIds) {
       chunkIds(playerIds, 20).forEach(async (ids) => { await sb.from('t').delete().in('player_id', ids); });
     }`,
    // A callback handed straight to a chunking helper.
    `async function f(sb) { return chunkedIn((ids) => sb.from('golf_holes').select('id').in('round_id', ids), 100); }`,
    // The loop variable of for…of over chunkIds.
    `async function f(sb, roundIds) {
       for (const ids of chunkIds(roundIds)) await sb.from('golf_holes').select('id').in('round_id', ids);
     }`,
    // Name heuristic (pre-existing behaviour).
    `function f(sb, idChunk) { return sb.from('t').select('id').in('id', idChunk); }`,
  ],
  invalid: [
    // An unbounded list from a parameter.
    { code: `function f(sb, ids) { return sb.from('t').select('id').in('id', ids); }`, errors: unchunked },
    // A let binding to a literal can be reassigned: not provably bounded.
    {
      code: `let ids = ['a', 'b', 'c', 'd']; ids = load(); sb.from('t').select('id').in('id', ids);`,
      errors: unchunked,
    },
    // A const built at runtime, not a literal.
    {
      code: `function f(sb, rows) { const ids = rows.map((r) => r.id); return sb.from('t').select('id').in('id', ids); }`,
      errors: unchunked,
    },
    // A long array literal with non-literal elements.
    { code: `sb.from('t').select('id').in('id', [a, b, c, d]);`, errors: unchunked },
    // A .map callback over something that is NOT a chunk helper.
    {
      code: `function f(sb, groups) { return groups.map((ids) => sb.from('t').select('id').in('id', ids)); }`,
      errors: unchunked,
    },
    // A callback handed to a helper that does not chunk.
    {
      code: `async function f(sb) { return readAll((ids) => sb.from('t').select('id').in('id', ids)); }`,
      errors: unchunked,
    },
    // An imported camelCase list is not trusted by name.
    {
      code: `import { playerIds } from './ids'; sb.from('t').select('id').in('id', playerIds);`,
      errors: unchunked,
    },
    // for…of over an unchunked list.
    {
      code: `async function f(sb, lists) { for (const ids of lists) await sb.from('t').select('id').in('id', ids); }`,
      errors: unchunked,
    },
  ],
});
