// =============================================================================
// Every UUID-shaped literal in a pgTAP suite must actually be a valid UUID.
//
// WHY THIS EXISTS. `baseball_no_policy_recursion.sql` shipped with fixture ids in
// a `…0000000cr101` family — chosen as a mnemonic for "recursion". **`r` is not a
// hex digit.** Postgres rejected the whole file on its first INSERT:
//
//   ERROR: invalid input syntax for type uuid: "00000000-0000-0000-0000-0000000cr101"
//
// The sibling suite it was modelled on uses `…0000000ba101`, where both letters
// happen to be hex, so the pattern looked safe to copy.
//
// WHY A STATIC TEST IS THE RIGHT PLACE. The suite's own pre-flight checks — plan
// count matches assertion count, scaffolding matches a sibling line for line, the
// `\ir` line matches the regex CI's harness strips it with — all passed. None of
// them could see this, because it is not a structural mistake: it is a typo inside
// a string literal that only the database validates. That cost a full CI round
// (~20 min) to learn something a regex answers in milliseconds.
//
// This is the cheap half of a two-part check. pgTAP itself remains the proof that
// the suites are CORRECT; this only proves their id literals are well-formed, which
// is the part that does not need a database and therefore should not wait for one.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RLS_DIR = join(process.cwd(), 'supabase', 'tests', 'rls');

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/**
 * Any single-quoted literal shaped like `8-4-4-4-12` — i.e. something written with
 * the INTENT of being a UUID. Matching on shape rather than on strict hex is the
 * whole point: a strict-hex pattern would simply not match the broken literal and
 * the test would pass vacuously.
 */
const UUID_SHAPED = /'([0-9a-zA-Z]{8}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{4}-[0-9a-zA-Z]{12})'/g;

interface Bad {
  file: string;
  literal: string;
  line: number;
}

function badUuidLiterals(): Bad[] {
  if (!existsSync(RLS_DIR)) return [];
  const out: Bad[] = [];
  for (const file of readdirSync(RLS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
    const text = readFileSync(join(RLS_DIR, file), 'utf8');
    text.split('\n').forEach((line, i) => {
      UUID_SHAPED.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = UUID_SHAPED.exec(line)) !== null) {
        const lit = m[1];
        if (lit && !UUID_RE.test(lit)) out.push({ file, literal: lit, line: i + 1 });
      }
    });
  }
  return out;
}

describe('pgTAP fixture UUIDs are valid hex', () => {
  it('finds UUID-shaped literals at all (guards a vacuous pass)', () => {
    // If the directory moved or the regex broke, the main assertion would pass
    // without checking anything.
    const total = readdirSync(RLS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .reduce((n, f) => {
        const t = readFileSync(join(RLS_DIR, f), 'utf8');
        return n + (t.match(UUID_SHAPED)?.length ?? 0);
      }, 0);
    expect(total, 'no UUID-shaped literals found in supabase/tests/rls').toBeGreaterThan(20);
  });

  it('rejects any that are not valid hex', () => {
    const bad = badUuidLiterals().map((b) => `${b.file}:${b.line}  '${b.literal}'`);
    expect(
      bad,
      'These literals are shaped like UUIDs but contain non-hex characters, so ' +
        'Postgres will reject the statement with `invalid input syntax for type ' +
        'uuid` and abort the whole suite on its first use. Only [0-9a-f] are ' +
        'legal — a mnemonic like "cr" for recursion or "gp" for group is not. ' +
        'This has already cost one CI round.',
    ).toEqual([]);
  });
});
