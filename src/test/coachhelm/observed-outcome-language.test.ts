// =============================================================================
// Guard: no coach- or player-facing string, or chat/LLM-facing text, may
// assert an outcome as PROVEN/CAUSED/GUARANTEED, or state a quantified
// "Saved N strokes" figure, when the underlying data is an observed
// before/after difference (never a randomized or controlled measurement).
//
// WHY THIS EXISTS. Repair-plan §14.12 ("replace 'proven' with appropriately
// limited observed-outcome language"), triggered by a real, live bug: the
// coach/player `InsightCard`'s outcome badge rendered "Saved {impact}
// strokes/rd" once a human marked a focus area's insight `improved` —
// `impact` is `evidence.strokes_impact`, the insight's GENERATION-TIME
// counterfactual estimate ("strokes recoverable IF this were fixed", see
// `patternToInsightVocabulary.ts`), never a post-outcome measurement. The
// badge presented an old, un-measured estimate as if it had just been proven
// recovered. Fixed to the codebase's own established "~N str/rd at stake"
// hedge (already used everywhere else this same field is shown —
// `EvidencePanel.tsx`, `DiagnosisPanel.tsx`, and this same file's own
// pre-outcome subtitle) — see `InsightCard.tsx`'s `OutcomeBadge`.
//
// WHY THE TYPESCRIPT PARSER AND NOT A RAW-TEXT REGEX. A regex over whole
// file text hits every developer comment discussing causality/proof/lift as
// engineering vocabulary (this codebase has ~40 such comments — dev prose
// about `causal-relationships` actions, `surface-lift` CSS, incident
// "proven" lifecycle states, etc.) — none of that is ever shown to a coach,
// player, or LLM. Comments and identifiers are never visited by an AST walk
// that only descends into string literals, template literals, and JSX text,
// so they produce no false positives without needing a per-comment
// allowlist (same reasoning as `dom-nesting/no-nested-interactive.test.ts`'s
// own "why the parser and not a regex" note).
//
// SCOPE. Coach/player UI (`components/golf/coachhelm`,
// `components/fairway/pages/coachhelm`, `components/golf/player-hub`) and
// CoachHelm's chat/generation surfaces (`lib/coachhelm/v3/chat`,
// `lib/coachhelm/v3/brief`, `lib/coachhelm/v3/composite`,
// `lib/coachhelm/v3/insights`) — the places this addendum names ("coach-
// and player-facing string ... chat tool description and LLM prompt") plus
// the adjacent surfaces most likely to grow one next. The player-hub and
// brief/composite/insights roots currently produce zero hits — added
// anyway (rev-2023 SHOULD 4) since a clean scan costs nothing and a future
// violation there would otherwise go unguarded exactly like `InsightCard`'s
// did. Admin-only analytics dashboards (`app/admin/**`) are a different,
// internal audience reading a raw score, not an outcome claim to an end
// user, and stay out of scope.
//
// DiagnosisPanel.tsx's "Caused by" → "Preceded by" (rev-2023 MUST 2): fixed
// at the source instead of allowlisted — an observed temporal sequence
// (root_cause happening before symptom in the recorded shot data) is a
// measured FACT (see its own `CausalityChip`) but still not a controlled
// measurement, so it can't back a causal claim either. No file in this
// codebase is allowlisted by this guard any more; if one legitimately needs
// to be, allowlist the EXACT span (not the whole file) with a reason.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

const SCAN_ROOTS = [
  'components/golf/coachhelm',
  'components/fairway/pages/coachhelm',
  'components/golf/player-hub',
  'lib/coachhelm/v3/chat',
  'lib/coachhelm/v3/brief',
  'lib/coachhelm/v3/composite',
  'lib/coachhelm/v3/insights',
].map((p) => path.join(SRC, p));

interface ForbiddenPattern {
  pattern: RegExp;
  label: string;
}

// A "saved ... strokes" claim in EITHER order ("Saved ~1.2 str/rd" and the
// reversed "1.2 strokes saved" both assert the same measured-saving claim),
// and matching the "str/rd" abbreviation this codebase actually uses (the
// hedged phrasing itself, "~N str/rd at stake", never pairs "str/rd" with
// "saved"/"saving" nearby, so this stays false-positive-free against it).
const SAVE_WORD = /\bsav(?:ed|ing)\b/.source;
const STROKE_WORD = /\bstr(?:okes?|\/rd)\b/.source;

const FORBIDDEN: ForbiddenPattern[] = [
  {
    pattern: new RegExp(`${SAVE_WORD}[\\s\\S]{0,20}${STROKE_WORD}`, 'i'),
    label:
      'a quantified "Saved ... strokes" / "Saved ... str/rd" claim (asserts a MEASURED saving) — use the hedged "~N str/rd at stake" phrasing this codebase already uses everywhere else for the same evidence.strokes_impact estimate',
  },
  {
    pattern: new RegExp(`${STROKE_WORD}[\\s\\S]{0,20}${SAVE_WORD}`, 'i'),
    label:
      'a quantified "N strokes ... saved" claim in REVERSED order (asserts a MEASURED saving) — use the hedged "~N str/rd at stake" phrasing instead',
  },
  {
    pattern: /\bprov(?:en|ed|es|e)\b/i,
    label:
      '"prove"/"proven"/"proved"/"proves" — an observed before/after difference is not proof (a small sample can clear a support floor by chance, and nothing rules out a confound); use "supported"/"observed change" instead (see event-ledger.ts\'s deriveTrustStatus, N9)',
  },
  {
    pattern: /\bcaused by\b/i,
    label:
      '"caused by" as an outcome claim — needs hedged, method-version-aware language, not asserted causation',
  },
  {
    pattern: /\bguaranteed\b/i,
    label: '"guaranteed" — no attribution mechanism in this codebase guarantees an outcome',
  },
];

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // Root doesn't exist in this checkout — nothing to scan there.
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      collectSourceFiles(full, out);
    } else if (
      (entry.endsWith('.ts') || entry.endsWith('.tsx')) &&
      !entry.includes('.test.') &&
      !entry.includes('.spec.') &&
      !entry.endsWith('.d.ts')
    ) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Extracts every span of text a coach, player, or LLM actually reads:
 *  - string / template literals (attribute values, tool descriptions, prompt
 *    text, plain strings)
 *  - JSX text, reconstructed PER ELEMENT rather than per individual text
 *    node — `<span>Saved {impact} strokes/rd</span>` is three JSX children
 *    (text, expression, text), and a real reader sees them concatenated as
 *    one rendered line. Reconstructing per-node would let "Saved" and
 *    "strokes" land in two separate spans that neither pattern alone
 *    matches, missing exactly the shape this guard exists to catch. Each
 *    JsxExpression child (`{impact.toFixed(1)}`) is replaced with a single
 *    placeholder character — its own nested JSX (if any) is still walked
 *    and checked on its own by the recursive descent below.
 *
 *  KNOWN LIMITATION (rev-2023 SHOULD 5) — SIBLING JSX ELEMENTS, not just
 *  sibling text/expression nodes, are each their OWN independent span: a
 *  phrase split across two adjacent tags, e.g.
 *  `<span>Saved</span> <span>strokes</span>`, produces two separate spans
 *  ("Saved" and "strokes") and neither alone matches a two-word pattern
 *  like `SAVE_WORD ... STROKE_WORD` below — this guard would miss that
 *  exact split. `<span>Saved {x} strokes</span>` (one element, an
 *  expression child in between) IS caught — that's what the "per element,
 *  not per node" flattening above exists for. A real forbidden phrase
 *  deliberately split across sibling tags for styling would be unusual
 *  (and worth a human's attention if it ever appears), but it's a real gap
 *  in this walker, not a hypothetical one — noted rather than silently
 *  assumed away.
 */
function extractUserFacingText(label: string, source: string): Array<{ line: number; text: string }> {
  const sf = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const spans: Array<{ line: number; text: string }> = [];

  const push = (node: ts.Node, text: string) => {
    if (!text.trim()) return;
    const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
    spans.push({ line: line + 1, text });
  };

  const walk = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      push(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      push(node, node.getText());
    } else if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const flat = node.children
        .map((child) => (ts.isJsxText(child) ? child.getText() : '•'))
        .join('');
      push(node, flat);
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
  return spans;
}

function findViolations(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const spans = extractUserFacingText(file, source);
  const violations: string[] = [];
  for (const { line, text } of spans) {
    for (const { pattern, label } of FORBIDDEN) {
      if (pattern.test(text)) {
        violations.push(
          `${path.relative(SRC, file)}:${line} — ${JSON.stringify(text.trim().slice(0, 100))} — ${label}`,
        );
      }
    }
  }
  return violations;
}

describe('observed-outcome language: no causal-certainty claim in coach/player UI or chat surfaces', () => {
  it('no scanned string/JSX text asserts proven/caused-by/guaranteed, or a quantified "Saved N strokes" outcome', () => {
    const files = SCAN_ROOTS.flatMap((root) => collectSourceFiles(root));
    // Guard the guard: an empty file list (e.g. a moved directory) would
    // pass for the wrong reason.
    expect(files.length).toBeGreaterThan(50);

    const violations = files.flatMap(findViolations);
    expect(violations).toEqual([]);
  }, 30000);

  it('actually detects the exact violation this guard was written for (the detector is not vacuous)', () => {
    // The real shape `InsightCard.tsx`'s OutcomeBadge rendered before the
    // fix: JSX text split around an expression container.
    const fixture = `
      export function Badge({ impact }: { impact: number }) {
        return (
          <span data-testid="insight-outcome-badge">
            Saved {impact.toFixed(1)} strokes/rd
          </span>
        );
      }
    `;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it('does not flag the fixed, hedged phrasing for the same badge', () => {
    const fixture = `
      export function Badge({ impact }: { impact: number }) {
        return (
          <span data-testid="insight-outcome-badge">
            Improved · ~{impact.toFixed(1)} str/rd at stake
          </span>
        );
      }
    `;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations).toEqual([]);
  });

  it('flags "proven" and "caused by" and "guaranteed" in a plain string literal too, not just JSX text', () => {
    const fixture = `
      const toolDescription = "This insight is proven effective, guaranteed, and the improvement was caused by this exact change.";
    `;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    // All three forbidden words appear in the same string literal span, so
    // this asserts at least one violation reason fired per word rather than
    // asserting an exact count that would be fragile to reorder.
    const matchedLabels = new Set(
      violations.flatMap((span) => FORBIDDEN.filter(({ pattern }) => pattern.test(span.text)).map((f) => f.label)),
    );
    expect(matchedLabels.size).toBe(3);
  });

  it('flags the abbreviated "Saved ~N str/rd" form (rev-2023 MUST 1) — not just the spelled-out "strokes"', () => {
    const fixture = `<span>Saved ~1.2 str/rd</span>`;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it('flags the REVERSED order "N strokes saved" (rev-2023 MUST 1) — same claim, opposite word order', () => {
    const fixture = `<span>1.2 strokes saved this round</span>`;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it('flags the reversed order with the "str/rd" abbreviation too ("1.2 str/rd saved")', () => {
    const fixture = `<span>1.2 str/rd saved</span>`;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations.length).toBeGreaterThan(0);
  });

  it.each(['prove', 'proves', 'proved', 'proven'])(
    'flags every conjugation of "prove" (rev-2023 MUST 1), not just "proven" — case: %s',
    (word) => {
      const fixture = `<span>This will ${word} it works</span>`;
      const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
        FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
      );
      expect(violations.length).toBeGreaterThan(0);
    },
  );

  it('does not flag "improve"/"improvement" as a false positive of the "prove" family (word-boundary check)', () => {
    const fixture = `<span>This should improve your approach shots</span>`;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations).toEqual([]);
  });

  it('does not flag an unrelated, legitimate use of "saved" (no nearby "strokes")', () => {
    const fixture = `
      export function DraftBanner() {
        return <span>Draft saved</span>;
      }
    `;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    expect(violations).toEqual([]);
  });

  it('does not flag developer comments or code identifiers (causal-relationships imports, surface-lift CSS, etc.) — only string/template/JSX-text spans are ever checked', () => {
    const fixture = `
      // This comment says proven, caused by, and guaranteed, and lift — none of
      // it is user-facing.
      import type { CausalRelationshipRow } from '@/app/golf/actions/causal-relationships';
      const cls = 'surface-lift rounded-xl';
      type Foo = CausalRelationshipRow;
      void cls;
    `;
    const violations = extractUserFacingText('fixture.tsx', fixture).filter((span) =>
      FORBIDDEN.some(({ pattern }) => pattern.test(span.text)),
    );
    // 'surface-lift rounded-xl' IS a string literal and gets extracted, but
    // none of the FORBIDDEN patterns match "lift" at all (deliberately —
    // see the file header), so it must not appear here.
    expect(violations).toEqual([]);
  });
});
