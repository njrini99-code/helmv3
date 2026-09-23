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
// `components/fairway/pages/coachhelm`) and the CoachHelm chat surface
// (`lib/coachhelm/v3/chat`) — the two places this addendum names
// ("coach- and player-facing string ... chat tool description and LLM
// prompt"). Admin-only analytics dashboards (`app/admin/**`) are a
// different, internal audience reading a raw score, not an outcome claim to
// an end user, and are out of scope. `DiagnosisPanel.tsx`'s "Caused by" is a
// different axis — root-cause DIAGNOSIS (why a symptom happens, an honest
// measured-fact-vs-hypothesis distinction the panel already makes), not an
// OUTCOME claim about whether an intervention worked — allowlisted here,
// flagged separately to the task owner rather than silently left unguarded.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

const SCAN_ROOTS = [
  'components/golf/coachhelm',
  'components/fairway/pages/coachhelm',
  'lib/coachhelm/v3/chat',
].map((p) => path.join(SRC, p));

/**
 * Allowlisted by path, not by string content — an allowlisted file is
 * exempt from every pattern below, so keep this list short and each entry
 * justified in the header comment above.
 */
const ALLOWLIST_FILES = new Set([
  path.join(SRC, 'components/golf/coachhelm/insights/DiagnosisPanel.tsx'),
]);

interface ForbiddenPattern {
  pattern: RegExp;
  label: string;
}

const FORBIDDEN: ForbiddenPattern[] = [
  {
    pattern: /\bsaved\b[\s\S]{0,20}\bstrokes?\b/i,
    label:
      'a quantified "Saved ... strokes" claim (asserts a MEASURED saving) — use the hedged "~N str/rd at stake" phrasing this codebase already uses everywhere else for the same evidence.strokes_impact estimate',
  },
  {
    pattern: /\bproven\b/i,
    label:
      '"proven" — an observed before/after difference is not proof (a small sample can clear a support floor by chance, and nothing rules out a confound); use "supported"/"observed change" instead (see event-ledger.ts\'s deriveTrustStatus, N9)',
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
  if (ALLOWLIST_FILES.has(file)) return [];
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
