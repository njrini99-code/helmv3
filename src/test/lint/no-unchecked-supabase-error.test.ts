import { afterAll, describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from '../../../eslint-rules/no-unchecked-supabase-error.mjs';

/**
 * A canary for the ratchet itself.
 *
 * The rule is enforced by a COUNT (scripts/supabase-error-audit.mjs), and a
 * count cannot tell "nothing to find" from "the rule stopped finding". It
 * already reported a file as clean while a shipped bug sat in it: C16, the golf
 * calendar rendering an empty season for a rostered player whose membership
 * read failed inside a `Promise.all`. The rule only looked at
 * `const { data } = await …`, so the whole-result shape was invisible.
 *
 * These cases pin BOTH shapes and, just as importantly, the things that must
 * stay unflagged — a rule that fires on guarded code gets switched off.
 */

// RuleTester drives the test runner itself (it calls describe/it), so this
// runs at module scope — nesting it inside an `it` makes vitest reject the
// suite call outright.
// `RuleTester`'s static hooks are runtime-configurable but absent from
// @types/eslint, so this is cast rather than left to fail typecheck.
const hooks = RuleTester as unknown as {
  afterAll: typeof afterAll;
  describe: typeof describe;
  it: typeof it;
};
hooks.afterAll = afterAll;
hooks.describe = describe;
hooks.it = it;

const ruleTester = new RuleTester({
  languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

ruleTester.run('helm/no-unchecked-supabase-error', rule as never, {
    valid: [
      // The error is bound. What the author does with it is their call.
      `async function f(supabase) {
         const { data, error } = await supabase.from('golf_teams').select('id');
         if (error) throw error;
         return data;
       }`,
      // Whole-result binding, but `.error` IS read — this is the pattern
      // calendar/page.tsx now uses, and it must not be flagged.
      `async function f(supabase, playerId) {
         const [teamResult] = await Promise.all([
           supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle(),
         ]);
         if (teamResult.error) throw teamResult.error;
         return teamResult.data?.team_id ?? null;
       }`,
      // Nothing is read off the binding at all, so nothing is asserted.
      `async function f(supabase) {
         const result = await supabase.from('golf_teams').select('id');
         return result;
       }`,
      // Not a Supabase chain.
      `async function f(api) {
         const { data } = await api.fetchTeams();
         return data;
       }`,
    ],
    invalid: [
      {
        code: `async function f(supabase) {
                 const { data } = await supabase.from('golf_teams').select('id');
                 return data;
               }`,
        errors: [{ messageId: 'uncheckedError' }],
      },
      {
        // C16's exact shape: Promise.all, `.data` read, `.error` never.
        code: `async function f(supabase, playerId) {
                 const [coachTeamId, playerTeamResult] = await Promise.all([
                   Promise.resolve(null),
                   supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle(),
                 ]);
                 return coachTeamId || playerTeamResult.data?.team_id || null;
               }`,
        errors: [{ messageId: 'uncheckedResult' }],
      },
      {
        // The ternary form used throughout the calendar page.
        code: `async function f(supabase, playerId) {
                 const [teamResult] = await Promise.all([
                   playerId
                     ? supabase.from('golf_team_members').select('team_id').maybeSingle()
                     : Promise.resolve({ data: null, error: null }),
                 ]);
                 return teamResult.data?.team_id ?? null;
               }`,
        errors: [{ messageId: 'uncheckedResult' }],
      },
      {
        code: `async function f(supabase) {
                 const result = await supabase.from('golf_teams').select('id');
                 return result.data ?? [];
               }`,
        errors: [{ messageId: 'uncheckedResult' }],
      },
    ],
});
