// POSITIVE fixture for helmv3-no-limit-above-postgrest-cap.
//
// Intentionally broken — this file exists only to prove the rule still fires.
// CI excludes .coderabbit/**/__test__/ from scans of changed files.
//
// Run locally:
//   ast-grep scan --rule .coderabbit/ast-grep/no-limit-above-postgrest-cap.yml \
//     .coderabbit/semgrep/__test__/positive-limit-above-cap.ts
//
// Expected: 2 errors (the 5000 and the 2000). The 1000 and 500 are clean, and
// a non-literal argument is out of scope — the rule is syntactic, so a const
// above the cap still slips through. That is why the real defence is the
// short-page check comparing against 1000, not this rule alone.

declare const db: {
  from: (t: string) => {
    select: (c: string) => {
      limit: (n: number) => Promise<unknown>;
    };
  };
};

declare const BATCH: number;

// ruleid: helmv3-no-limit-above-postgrest-cap
export const tooMany = db.from('golf_rounds').select('id').limit(5000);

// ruleid: helmv3-no-limit-above-postgrest-cap
export const alsoTooMany = db.from('golf_shots').select('id').limit(2000);

// ok: exactly the cap — honest about what it returns
export const atCap = db.from('golf_holes').select('id').limit(1000);

// ok: well under the cap
export const small = db.from('golf_players').select('id').limit(500);

// ok (not detectable): identifier rather than a literal
export const viaConst = db.from('admin_events').select('id').limit(BATCH);
