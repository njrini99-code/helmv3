// =============================================================================
// Guard: no interactive element may be statically nested inside another one.
//
// WHY THIS IS A TEST AND NOT A LINT PREFERENCE. HTML forbids interactive
// content inside a <button>, and browsers do not merely warn — the parser
// SPLITS the outer button when it encounters the inner one. So the DOM built
// from server-rendered HTML has a different shape than the tree React expects,
// and React hydration mismatches (#418 / #425). CLAUDE.md records this as a
// known trap ("a nested button/link is invalid HTML and a hydration-crash
// class") but nothing executed that rule until now, which is exactly the
// pattern that let several other documented-but-unchecked invariants rot.
//
// WHY THE TYPESCRIPT PARSER AND NOT A REGEX. A regex cannot do this. The
// obvious `<button[^>]*/>` self-closing pattern fails on
// `<button onClick={() => x} />` because the arrow function contains a `>`, so
// the element never appears to close and every later button in the file looks
// nested. A first attempt at this check reported 27 violations; all 27 were
// that false positive. Parsing the JSX gives the real answer, which was two.
//
// SCOPE. Static nesting only — a <button> whose JSX subtree contains another
// interactive element. It cannot see nesting composed at runtime (a component
// that happens to render a <button> passed as `children` into another
// component's <button>). That is a real gap; this catches the shape that
// actually occurred here.
// =============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

/** Intrinsic elements that may not contain other interactive content. */
const INTERACTIVE_INTRINSIC = new Set(['button', 'a']);
/**
 * Components that render an interactive element.
 *
 * 2026-07-29: this was `{ 'Link' }` only, and that gap let the exact bug this
 * file exists to prevent ship undetected. `src/app/golf/admin/crm/components/
 * CalendarView.tsx` had a month day cell that was `<Button>` wrapping event pills
 * that are also `<Button>` — a <button> inside a <button> — and this guard walked
 * straight past it, because the set is case-sensitive so 'Button' matched neither
 * INTERACTIVE_INTRINSIC's 'button' nor a one-entry component list. Found by
 * reading the DOM when the component was finally mounted (#1111), not by the
 * check that was supposed to catch it.
 *
 * All three of these render a real `<button>`: Button (button.tsx:81),
 * IconButton (:176), ButtonGroupOption (:212). If another wrapper is added there,
 * add it here too — the guard is only as complete as this list.
 */
const INTERACTIVE_COMPONENTS = new Set([
  'Link',
  'Button',
  'IconButton',
  'ButtonGroupOption',
]);

function isInteractive(name: string): boolean {
  return INTERACTIVE_INTRINSIC.has(name) || INTERACTIVE_COMPONENTS.has(name);
}

function collectTsx(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsx(full, out);
    } else if (
      entry.endsWith('.tsx') &&
      !entry.includes('.test.') &&
      !entry.includes('.spec.')
    ) {
      out.push(full);
    }
  }
  return out;
}

function tagNameOf(node: ts.JsxElement | ts.JsxSelfClosingElement): string {
  const tag = ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName;
  return tag.getText();
}

/**
 * `asChild` means the component renders NO wrapper of its own.
 *
 * This repo has two Button components and only one of them is a wrapper:
 *   - `@/components/fairway/controls/button` — `const Comp = asChild ? Slot : 'button'`
 *     (button.tsx:157). With `asChild`, Radix's Slot merges the props onto the
 *     child, so `<Button asChild><Link/></Button>` emits ONE `<a>`. Valid.
 *   - `@/components/ui/button` — always emits a real `<button>`.
 *
 * Without this, adding 'Button' to the interactive set reported ~35 violations
 * and every `<Link> inside <Button>` among them was a false positive on the Slot
 * pattern — which is used at 167 call sites. A guard that cries wolf at 167 valid
 * call sites gets deleted, so it must understand the escape hatch.
 *
 * Precision note: a bare `asChild` or `asChild={true}` is definitely a Slot. A
 * computed `asChild={expr}` is only conditionally a Slot, and this treats it as
 * one. That is a deliberate false-negative — the alternative is flagging valid
 * code, and the shape this guard exists to catch (#1111's month cell) passes no
 * asChild at all.
 */
function rendersNoWrapper(node: ts.JsxElement | ts.JsxSelfClosingElement): boolean {
  const attrs = ts.isJsxElement(node) ? node.openingElement.attributes : node.attributes;
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue;
    if (attr.name.getText() !== 'asChild') continue;
    // Bare `asChild` has no initializer.
    if (!attr.initializer) return true;
    if (ts.isJsxExpression(attr.initializer)) {
      const expr = attr.initializer.expression;
      // `asChild={false}` really is a wrapper.
      if (expr && expr.kind === ts.SyntaxKind.FalseKeyword) return false;
    }
    return true;
  }
  return false;
}

/**
 * Ratchet key: file + shape, deliberately WITHOUT the line number.
 *
 * Keying on the line was the first attempt and it is unusable: inserting a line
 * anywhere above a known violation shifts it, so the recorded entry goes stale AND
 * the shifted one reads as new -- two spurious failures from an edit that changed
 * nothing about the nesting. Verified by injecting one violation into
 * app/not-found.tsx: it produced 3 failures, only 1 of them real. That file and
 * app/baseball/page.tsx each hold several, so this would have fired constantly, and
 * a guard that cries wolf on unrelated edits gets disabled rather than fixed.
 *
 * Cost of dropping the line: two violations of the same shape in the same file
 * collapse to one key, so fixing one of a pair will not trip the stale check until
 * both are fixed. Acceptable -- the job is to stop NEW files and NEW shapes, and the
 * line-accurate list is still printed on failure.
 */
function ratchetKey(violation: string): string {
  const sep = violation.indexOf(' \u2014 ');
  if (sep === -1) return violation;
  const fileline = violation.slice(0, sep);
  const shape = violation.slice(sep + 3);
  return `${fileline.replace(/:\d+$/, '')} \u2014 ${shape}`;
}

/**
 * KNOWN VIOLATIONS — a ratchet, not an amnesty.
 *
 * Extending INTERACTIVE_COMPONENTS to the repo's own Button wrappers (2026-07-29)
 * exposed 25 pre-existing violations. They are listed rather than fixed for one
 * reason: fixing 25 files across baseball, lifting, golf and the marketing page in
 * a single unattended pass is a worse risk than recording them, and CI already uses
 * this idiom ("Import-cycle ratchet"). The guard FAILS on anything not listed here,
 * so the count can only go down.
 *
 * Do NOT add an entry to make a build pass. Fix the nesting: the correct form for a
 * link-shaped button is `<Button asChild><Link/></Button>`, which renders ONE
 * element. Fixing one also requires deleting its line, enforced by the
 * stale-entries test below.
 */
const KNOWN_VIOLATIONS = new Set<string>([
  // -- EMPTY. Both classes are closed.
  //
  // SEVERE (interactive inside a <button>) was emptied by #1126: the parser closes
  // the outer button at the inner one, so the server DOM and the React tree
  // disagree and hydration throws (#418/#425).
  //
  // The 17 remaining entries were interactive content inside an <a>. That renders,
  // which is why it shipped, but it puts a control inside a control: two focusable
  // elements for one action, an ambiguous click target, and a screen reader
  // announcing a button nested in a link.
  //
  // They are gone because `asChild` now exists on `src/components/ui/button.tsx` —
  // it did not, which is the whole reason every one of these sites wrapped instead.
  // The correct shape for a link that looks like a button is:
  //
  //     <Button asChild><Link href="/x">Go</Link></Button>   // ONE <a>
  //
  // For a whole CARD that is clickable and also holds its own control, asChild does
  // not apply — use a stretched link (an `absolute inset-0` overlay sibling), as in
  // `components/features/college-card.tsx`.
  //
  // KEEP THIS LIST EMPTY. Adding an entry is not a build fix, it is shipping one of
  // the two defects above with a note attached.
]);

/**
 * Core detector, over source TEXT rather than a path.
 *
 * Split out so the fixture test can exercise the real walk without writing a
 * temp file. The first version of that test wrote to
 * `path.join(tmpdir(), 'nest-fixture-<pid>.tsx')`, which CodeQL correctly flagged
 * as `js/insecure-temporary-file` (high): a predictable name in a world-writable
 * directory is a symlink/TOCTOU vector. Passing the source in removes the file,
 * the alert, and the fs dependency from that test in one move.
 */
function findNestedInteractiveInSource(label: string, source: string): string[] {
  const sf = ts.createSourceFile(label, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const file = label;
  const violations: string[] = [];

  const walk = (node: ts.Node, ancestor: string | null): void => {
    let next = ancestor;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagNameOf(node);
      if (isInteractive(name)) {
        const slot = rendersNoWrapper(node);
        // A Slot emits no element of its own, so it is neither a violation
        // when inside another interactive element nor an ancestor for what
        // it contains.
        if (ancestor && !slot) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          violations.push(
            `${path.relative(SRC, file)}:${line + 1} — <${name}> nested inside <${ancestor}>`,
          );
        }
        if (!slot) next = name;
      }
    }
    ts.forEachChild(node, (child) => walk(child, next));
  };

  walk(sf, null);
  return violations;
}

function findNestedInteractive(file: string): string[] {
  return findNestedInteractiveInSource(file, readFileSync(file, 'utf8'));
}

/**
 * Block-level elements inside <p>.
 *
 * The other everyday hydration crash, and the same mechanism: <p> auto-closes
 * when the parser meets block content, so `<p>a<div>b</div></p>` becomes
 * `<p>a</p><div>b</div><p></p>` in the DOM — three siblings where React
 * expects one nested tree. React names this one explicitly:
 * "validateDOMNesting(...): <div> cannot appear as a descendant of <p>".
 */
const BLOCK_LEVEL = new Set([
  'div', 'p', 'ul', 'ol', 'table', 'section', 'article', 'form', 'blockquote',
  'pre', 'hr', 'figure', 'main', 'nav', 'header', 'footer', 'aside',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

function findBlockInParagraph(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  const walk = (node: ts.Node, insideParagraph: boolean): void => {
    let next = insideParagraph;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagNameOf(node);
      if (insideParagraph && BLOCK_LEVEL.has(name)) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`${path.relative(SRC, file)}:${line + 1} — <${name}> inside <p>`);
      }
      if (name === 'p') next = true;
    }
    ts.forEachChild(node, (child) => walk(child, next));
  };

  walk(sf, false);
  return violations;
}

describe('DOM nesting: interactive elements are never nested', () => {
  it('introduces no NEW interactive nesting', () => {
    const files = collectTsx(SRC);
    // Guard the guard: if the walk silently stopped matching anything, an
    // empty file list would make this pass for the wrong reason.
    expect(files.length).toBeGreaterThan(500);

    const violations = files.flatMap(findNestedInteractive);
    const fresh = violations.filter((v) => !KNOWN_VIOLATIONS.has(ratchetKey(v)));
    expect(fresh).toEqual([]);
  }, 120000);

  /**
   * The other half of a ratchet. Without this, the known-list only ever grows
   * stale: a violation gets fixed, its entry stays, and the entry then silently
   * licenses the same nesting being reintroduced at that exact line later.
   * Fixing one must force removing it here.
   */
  it('keeps the known-violation list free of stale entries', () => {
    const files = collectTsx(SRC);
    expect(files.length).toBeGreaterThan(500);

    const live = new Set(files.flatMap(findNestedInteractive).map(ratchetKey));
    const stale = [...KNOWN_VIOLATIONS].filter((k) => !live.has(k));
    expect(
      stale,
      'these are fixed or moved — delete them from KNOWN_VIOLATIONS',
    ).toEqual([]);
  }, 120000);


  /**
   * The asChild escape hatch, exercised through the REAL detector rather than a
   * re-implementation — the previous vacuity test inlined its own copy of the
   * walk, which would not have caught a bug in `rendersNoWrapper`.
   *
   * This is the assertion that keeps the guard honest in both directions: too
   * eager and it flags 167 valid Slot call sites and gets deleted; too lax and it
   * misses the CalendarView shape it exists for.
   */
  it('suppresses the Slot pattern but still catches a real wrapper', () => {
    const fixture = `
      export function F() {
        return (
          <div>
            {/* valid: Slot renders ONE <a> */}
            <Button asChild><Link href="/a">ok</Link></Button>
            <Button asChild={true}><Link href="/b">ok</Link></Button>
            {/* invalid: a real <button> wrapping a real <a> */}
            <Button><Link href="/c">bad</Link></Button>
            {/* invalid: asChild explicitly off */}
            <Button asChild={false}><Button>bad</Button></Button>
            {/* invalid: the CalendarView shape */}
            <Button><Button>bad</Button></Button>
            {/* valid: siblings, which is how CalendarView was fixed */}
            <div><Button>a</Button><Button>b</Button></div>
          </div>
        );
      }
    `;
    const found = findNestedInteractiveInSource('fixture.tsx', fixture).map((v) =>
      v.replace(/^.*? \u2014 /, ''),
    );
    expect(found).toEqual([
      '<Link> nested inside <Button>',
      '<Button> nested inside <Button>',
      '<Button> nested inside <Button>',
    ]);
  });

  it('actually detects nesting when it exists (the detector is not vacuous)', () => {
    // A checker that reports zero is worthless until it is shown to report
    // non-zero. This fixture reproduces both real shapes found in select.tsx —
    // a nested button, and a nested Link — plus the two shapes that a regex
    // check got wrong: a self-closing button whose attributes contain `=>`,
    // and an ordinary sibling button.
    const fixture = `
      import Link from 'next/link';
      export function Fixture() {
        return (
          <div>
            <button type="button" onClick={() => open()}>
              <button type="button" onClick={() => inner()}>nested</button>
              <Link href="/x">nested link</Link>
            </button>
            <button type="button" onClick={() => selfClosing()} />
            <button type="button">sibling</button>
          </div>
        );
      }
    `;
    const sf = ts.createSourceFile('fixture.tsx', fixture, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const walk = (node: ts.Node, ancestor: string | null): void => {
      let next = ancestor;
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = tagNameOf(node);
        if (isInteractive(name)) {
          if (ancestor) found.push(`${name} in ${ancestor}`);
          next = name;
        }
      }
      ts.forEachChild(node, (child) => walk(child, next));
    };
    walk(sf, null);

    expect(found).toEqual(['button in button', 'Link in button']);
  });
});

describe('DOM nesting: no block-level element inside a <p>', () => {
  it('finds no <div>/<ul>/<section>/… inside a paragraph', () => {
    const files = collectTsx(SRC);
    expect(files.length).toBeGreaterThan(500);

    const violations = files.flatMap(findBlockInParagraph);
    expect(violations).toEqual([]);
  }, 120000);

  it('actually detects a block inside a paragraph (not vacuous)', () => {
    const fixture = `
      export function Fixture() {
        return (
          <div>
            <p>text <div>block inside p</div></p>
            <p>fine <span>inline is allowed</span></p>
          </div>
        );
      }
    `;
    const sf = ts.createSourceFile('fixture.tsx', fixture, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found: string[] = [];
    const walk = (node: ts.Node, insideParagraph: boolean): void => {
      let next = insideParagraph;
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = tagNameOf(node);
        if (insideParagraph && BLOCK_LEVEL.has(name)) found.push(name);
        if (name === 'p') next = true;
      }
      ts.forEachChild(node, (child) => walk(child, next));
    };
    walk(sf, false);

    expect(found).toEqual(['div']);
  });
});
