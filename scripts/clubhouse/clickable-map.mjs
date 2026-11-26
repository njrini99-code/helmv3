#!/usr/bin/env node
/**
 * The Clubhouse clickable map: every interactive control in src/clubhouse, per page, read from the code.
 *
 * Writes docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md (never edit it). It replaces the hand-written
 * snapshot docs/clubhouse/history/CLICKABLES.md (2026-09-30), whose line citations went stale.
 *
 * A control is a JSX element that is a button or a link by tag (`button`, `a`, `summary`, a component named
 * `*Button` or `*Link`), or has an `onClick`, `onPress`, `onPointerDown` or `href` prop, or a role of button, link,
 * tab, menuitem, switch, checkbox or option. Each row gives the line, the element, its visible label (an aria-label,
 * its text, a string child, or a note that the label is built at run time), what makes it a control, and the nearest
 * `data-ch-code` (its own, a `code` prop, or the nearest ancestor's). Pages come from the manifests' `implementation`
 * paths (the longest match wins); files no manifest claims are listed as Shared. Tests and previews are left out.
 *
 * Deterministic on purpose: sorted, no dates, no commit ids, so `--check` fails only when the code or manifests changed.
 *
 *   node scripts/clubhouse/clickable-map.mjs           write the file
 *   node scripts/clubhouse/clickable-map.mjs --check   exit 1 if the file is stale
 *
 * Not wired into CI, `guards` or `docs:check`; that is the owner's decision.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const OUT = 'docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md';
const HANDLER_PROPS = ['onClick', 'onPress', 'onPointerDown', 'href'];
const ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox', 'option']);
/** A label made safe for a list line: no backticks or angle brackets, at most 40 characters. */
const plain = (s) => {
  const t = String(s ?? '').replace(/`/g, "'").replace(/</g, '‹').replace(/>/g, '›').replace(/\s+/g, ' ');
  return t.length > 40 ? `${t.slice(0, 39)}…` : t;
};
/** One control on one list line, short enough for the repo's markdown lint: line, element, label, reason, code. */
const line = (r) => `- ${r.line} \`${r.element}\` "${plain(r.label)}" (${r.via})${r.code ? ` ${r.code}` : ''}`;

const attrMap = (el) => {
  const out = new Map();
  for (const a of el.attributes.properties) if (ts.isJsxAttribute(a)) out.set(a.name.getText(), a);
  return out;
};
const stringOf = (attr) => {
  const init = attr?.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) return init.expression.text;
  return null;
};

/** The element's label: aria-label, then its text and string children, else a note. */
function labelOf(node, attrs) {
  const aria = stringOf(attrs.get('aria-label'));
  if (aria) return aria;
  if (attrs.has('aria-label')) return '(aria-label built at run time)';
  const parts = [];
  let dynamic = false;
  if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
    for (const c of node.parent.children) {
      if (ts.isJsxText(c)) {
        const t = c.text.replace(/\s+/g, ' ').trim();
        if (t) parts.push(t);
      } else if (ts.isJsxExpression(c) && c.expression && (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression))) parts.push(c.expression.text);
      else if (ts.isJsxExpression(c) && c.expression) dynamic = true;
      else if (ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)) dynamic = dynamic || parts.length === 0;
    }
  }
  const title = stringOf(attrs.get('title')) ?? stringOf(attrs.get('label'));
  if (parts.length) return parts.join(' ') + (dynamic ? ' …' : '');
  if (title) return title;
  return dynamic ? '(label built at run time)' : '(no label)';
}

const chCodeOf = (attrs) => stringOf(attrs.get('data-ch-code')) ?? stringOf(attrs.get('code'));

/** Controls in one file: [{ line, element, label, via, code }], in source order. */
export function controlsIn(text, file = 'x.tsx') {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rows = [];
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      const attrs = attrMap(node);
      const why = [];
      if (['button', 'a', 'summary'].includes(tag) || /(Button|Link)$/.test(tag)) why.push(tag === 'a' || /Link$/.test(tag) ? 'link' : 'button');
      for (const p of HANDLER_PROPS) if (attrs.has(p)) why.push(p);
      const role = stringOf(attrs.get('role'));
      if (role && ROLES.has(role)) why.push(`role=${role}`);
      if (tag === 'input' && ['submit', 'button', 'checkbox', 'radio'].includes(stringOf(attrs.get('type')) ?? '')) why.push(`type=${stringOf(attrs.get('type'))}`);
      if (why.length) {
        let code = chCodeOf(attrs);
        for (let p = ts.isJsxOpeningElement(node) ? node.parent?.parent : node.parent; !code && p; p = p.parent) {
          const open = ts.isJsxElement(p) ? p.openingElement : ts.isJsxSelfClosingElement(p) ? p : null;
          if (open) code = chCodeOf(attrMap(open));
        }
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        rows.push({ line: line + 1, element: tag, label: labelOf(node, attrs), via: [...new Set(why)].join(', '), code: code ?? '' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return rows;
}

/** Which page a file belongs to: the manifest whose implementation path is the longest prefix of it. */
export function pageOf(file, manifests) {
  let best = null;
  for (const m of manifests) {
    const i = m.implementation ?? {};
    for (const p of [i.root, i.loader, i.route, i.styles, ...(i.also ?? [])].filter(Boolean)) {
      if ((file === p || file.startsWith(`${p}/`)) && (!best || p.length > best.len)) best = { m, len: p.length };
    }
  }
  return best?.m ?? null;
}

/** `files` maps repo-relative .tsx paths to their text. */
export function buildMap({ files, manifests }) {
  const byPage = new Map();
  for (const file of Object.keys(files).sort()) {
    const rows = controlsIn(files[file], file);
    if (!rows.length) continue;
    const m = pageOf(file, manifests);
    const key = m ? `${m.id} ${m.name}` : 'Shared (no page manifest claims these files)';
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push({ file, rows });
  }
  const keys = [...byPage.keys()].sort((a, b) => (a.startsWith('Shared') ? 1 : b.startsWith('Shared') ? -1 : a.localeCompare(b)));
  let out = '# Clubhouse clickable map\n\n<!-- Generated by node scripts/clubhouse/clickable-map.mjs. Do not edit;\nchange the code or the manifests under config/clubhouse/pages/. -->\n\n';
  out += [
    'Every interactive control in `src/clubhouse` (tests and previews left out),',
    'per page:',
    'a button or link by tag, or a JSX element with `onClick`, `onPress`,',
    '`onPointerDown`, `href` or a control role. A line reads: source line, element,',
    'label, what makes it a control, then the nearest `data-ch-code` or `code` prop',
    '(on the element or an ancestor) when there is one. A label built at run time',
    'says so. This supersedes the 2026-09-30 snapshot in',
    '[CLICKABLES.md](../history/CLICKABLES.md).',
  ].join('\n') + '\n';
  const total = [...byPage.values()].flat().reduce((n, f) => n + f.rows.length, 0);
  out += `\n${total} controls in ${[...byPage.values()].flat().length} files.\n`;
  for (const key of keys) {
    const group = byPage.get(key);
    out += `\n## ${key}\n\n${group.reduce((n, f) => n + f.rows.length, 0)} controls.\n`;
    for (const { file, rows } of group) {
      out += `\n### \`${file}\`\n\n`;
      for (const r of rows) out += `${line(r)}\n`;
    }
  }
  return out;
}

function walk(root, rel, out = {}) {
  for (const n of readdirSync(join(root, rel)).sort()) {
    const p = `${rel}/${n}`;
    if (statSync(join(root, p)).isDirectory()) {
      if (n === '__tests__' || n === 'preview' || n === 'node_modules') continue;
      walk(root, p, out);
    } else if (n.endsWith('.tsx') && !/\.(test|spec)\.tsx$/.test(n)) out[p] = readFileSync(join(root, p), 'utf8');
  }
  return out;
}

export function loadManifests(root) {
  const dir = join(root, 'config/clubhouse/pages');
  return readdirSync(dir).filter((n) => /^P\d{3}-.+\.json$/.test(n)).sort().map((n) => JSON.parse(readFileSync(join(dir, n), 'utf8')));
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const text = buildMap({ files: walk(root, 'src/clubhouse'), manifests: loadManifests(root) });
  const path = join(root, OUT);
  if (process.argv.includes('--check')) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) {
      console.error(`${OUT} is stale; run node scripts/clubhouse/clickable-map.mjs`);
      process.exit(1);
    }
    console.log(`${OUT} is current.`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`wrote ${relative(root, path)} (${text.split('\n').length} lines)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
