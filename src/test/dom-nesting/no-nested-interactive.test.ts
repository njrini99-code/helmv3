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
/** Components that render an interactive element. */
const INTERACTIVE_COMPONENTS = new Set(['Link']);

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

function findNestedInteractive(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: string[] = [];

  const walk = (node: ts.Node, ancestor: string | null): void => {
    let next = ancestor;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const name = tagNameOf(node);
      if (isInteractive(name)) {
        if (ancestor) {
          const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
          violations.push(
            `${path.relative(SRC, file)}:${line + 1} — <${name}> nested inside <${ancestor}>`,
          );
        }
        next = name;
      }
    }
    ts.forEachChild(node, (child) => walk(child, next));
  };

  walk(sf, null);
  return violations;
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
  it('finds no <button>/<a>/<Link> inside another interactive element', () => {
    const files = collectTsx(SRC);
    // Guard the guard: if the walk silently stopped matching anything, an
    // empty file list would make this pass for the wrong reason.
    expect(files.length).toBeGreaterThan(500);

    const violations = files.flatMap(findNestedInteractive);
    expect(violations).toEqual([]);
  }, 120000);

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
