#!/usr/bin/env node
/**
 * The Clubhouse clickable map and control ledger: every interactive control in src/clubhouse, per page, read from the
 * code, each with a permanent id (spec §4.7, owner decision D11).
 *
 * A control is a JSX element that is a button or a link by tag (`button`, `a`, `summary`, a component named
 * `*Button` or `*Link`), or has an `onClick`, `onPress`, `onPointerDown` or `href` prop, or a role of button, link,
 * tab, menuitem, switch, checkbox or option. Pages come from the manifests' `implementation` paths (the longest match
 * wins; an exact file beats a shared directory; a tie goes to the lower page id); files no manifest claims are Shared,
 * numbered under P000. Tests and previews are left out.
 *
 * Ids. Each control carries `data-ctl="CTL-P###-NNN"` on its element. The id is permanent: it travels with the element
 * through edits and moves (the page prefix is where it was first numbered; `page` in the ledger is where it is now).
 * A control without one gets the next free number on its page; a number is never reused. An id found twice (a copy,
 * or two branches that both took the same next number) stays on its first occurrence by file and position; the
 * others get new numbers. A ledger id no longer in the code moves to that ledger's tombstones.
 *
 * Forwarding. A shared component (ui/Button, IconButton, BackLink, a page's NavRow) takes `data-ctl` from its caller
 * and writes it on its DOM element as `data-ctl={…}`. An element whose `data-ctl` is an expression is a forwarder: it
 * is listed, but it takes no id of its own; its callers' ids reach the DOM through it. An expression holding a
 * `'CTL-…'` literal (`data-ctl={ctl ?? 'CTL-P007-004'}`) is that element's own id.
 *
 * The ledger, config/clubhouse/controls/P###.json (one per id prefix), holds per id: page, file, element, label or
 * labelTemplate, description, role, viewport, actions (ACT- ids), board verdict (CLICKABLES.md, 2026-09-30) and the
 * nearest CH- code. label, labelTemplate and description are authored: --assign fills them once and keeps them after
 * (a static label in the code is the exception: the code is the truth, so it is refreshed). Everything else is derived
 * on every run.
 *
 *   node scripts/clubhouse/clickable-map.mjs            write the map
 *   node scripts/clubhouse/clickable-map.mjs --check    exit 1 if the map is stale or a control is unnumbered/unlabelled
 *   node scripts/clubhouse/clickable-map.mjs --assign   number every control, write data-ctl, the ledgers and the map
 *   node scripts/clubhouse/clickable-map.mjs --assign --page P007   only files on that page (P000 for Shared)
 *
 * --assign is deterministic and idempotent: a second run changes nothing. After a rebase or merge, rerun it (take
 * either side of a conflicted ledger first; it rebuilds the rest from the code). Deterministic output on purpose:
 * sorted, no dates except a tombstone's removedAt, no commit ids.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const OUT = 'docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md';
export const LEDGER_DIR = 'config/clubhouse/controls';
export const SHARED_PAGE = 'P000';
export const CTL_RE = /^CTL-(P\d{3})-(\d{3,})$/;
const CTL_ANY = /CTL-P\d{3}-\d{3,}/;
const HANDLER_PROPS = ['onClick', 'onPress', 'onPointerDown', 'href'];
const ROLES = new Set(['button', 'link', 'tab', 'menuitem', 'switch', 'checkbox', 'option']);
const NOT_IDENT_ATTRS = new Set(['className', 'style', 'key', 'ref', 'id', 'children']);
const MAX_LINE = 80;

/** A label made safe for a list line: no backticks or angle brackets, collapsed spaces. */
const plain = (s) => String(s ?? '').replace(/`/g, "'").replace(/</g, '‹').replace(/>/g, '›').replace(/\s+/g, ' ').trim();
const clip = (s, n) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s);

const attrMap = (el) => {
  const out = new Map();
  for (const a of el.attributes.properties) if (ts.isJsxAttribute(a)) out.set(a.name.getText(), a);
  return out;
};
const isStr = (e) => e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e));
const stringOf = (attr) => {
  const init = attr?.initializer;
  if (!init) return null;
  if (ts.isStringLiteral(init)) return init.text;
  if (ts.isJsxExpression(init) && isStr(init.expression)) return init.expression.text;
  return null;
};
const exprOf = (attr) => (attr?.initializer && ts.isJsxExpression(attr.initializer) ? attr.initializer.expression ?? null : null);

/** A short name for a run-time value in a label template: `p.name` → name, `fmt(d)` → fmt, `a ? 'X' : 'Y'` → X|Y. */
function nameOf(e) {
  if (!e) return '…';
  if (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isNonNullExpression(e)) return nameOf(e.expression);
  if (isStr(e)) return e.text;
  if (ts.isNumericLiteral(e)) return e.text;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  if (ts.isElementAccessExpression(e)) return nameOf(e.expression);
  if (ts.isCallExpression(e)) return nameOf(e.expression);
  if (ts.isConditionalExpression(e)) return `${nameOf(e.whenTrue)}|${nameOf(e.whenFalse)}`;
  if (ts.isBinaryExpression(e)) return nameOf(e.left);
  if (ts.isTemplateExpression(e)) return templateOf(e);
  return '…';
}

/** A template literal as a label template: `Open ${p.name}'s stats` → "Open {name}'s stats". */
function templateOf(e) {
  if (isStr(e)) return e.text;
  if (ts.isTemplateExpression(e)) {
    let s = e.head.text;
    for (const span of e.templateSpans) s += `{${nameOf(span.expression)}}${span.literal.text}`;
    return s;
  }
  if (ts.isConditionalExpression(e) && isStr(e.whenTrue) && isStr(e.whenFalse)) return `{${e.whenTrue.text}|${e.whenFalse.text}}`;
  return `{${nameOf(e)}}`;
}

const ENTITIES = { amp: '&', nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…', middot: '·', mdash: '—', ndash: '–', times: '×', apos: "'", quot: '"', larr: '←', rarr: '→' };
const decode = (s) => s.replace(/&([a-z]+);/g, (m, n) => ENTITIES[n] ?? m).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

/** The visible text of JSX children: [text, dynamic]. Hidden children (aria-hidden, Icon, kbd, svg) say nothing. */
function childText(children) {
  let text = '';
  let dynamic = false;
  // Text and values join as written (`Open {name}'s thread`); a child element's words are set off by a space.
  const add = (s, apart = false) => {
    text += apart ? ` ${s} ` : s;
  };
  /** JSX's own whitespace rule: a run with a line break collapses; spaces within a line stay. */
  const jsxText = (raw) => {
    const lines = decode(raw).split(/\r?\n/);
    if (lines.length === 1) return lines[0];
    return lines
      .map((l, i) => (i === 0 ? l.trimEnd() : i === lines.length - 1 ? l.trimStart() : l.trim()))
      .filter(Boolean)
      .join(' ');
  };
  const walkExpr = (e) => {
    if (!e) return;
    if (ts.isParenthesizedExpression(e)) return walkExpr(e.expression);
    if (isStr(e)) return add(e.text);
    if (ts.isJsxElement(e) || ts.isJsxSelfClosingElement(e) || ts.isJsxFragment(e)) return walkNode(e);
    if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      const [t] = childText([wrap(e.right)]);
      if (t) {
        dynamic = true;
        add(`{${t}|}`);
      }
      return;
    }
    if (ts.isConditionalExpression(e)) {
      const [a] = childText([wrap(e.whenTrue)]);
      const [b] = childText([wrap(e.whenFalse)]);
      dynamic = true;
      if (a === b) add(a);
      else add(`{${a}|${b}}`);
      return;
    }
    dynamic = true;
    add(templateOf(e));
  };
  /** An expression as a child, so a branch reads the same way as a child does. */
  const wrap = (x) => ({ kind: -1, expression: x, __branch: true });
  const walkNode = (n) => {
    if (n.__branch) walkExpr(n.expression);
    else if (ts.isJsxText(n)) add(jsxText(n.text));
    else if (ts.isJsxExpression(n)) walkExpr(n.expression);
    else if (ts.isJsxFragment(n)) n.children.forEach(walkNode);
    else if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
      const open = ts.isJsxElement(n) ? n.openingElement : n;
      const tag = open.tagName.getText();
      const a = attrMap(open);
      const hidden = a.get('aria-hidden');
      if (hidden && (!hidden.initializer || stringOf(hidden) === 'true' || exprOf(hidden)?.kind === ts.SyntaxKind.TrueKeyword)) return;
      if (['Icon', 'svg', 'kbd', 'Spinner', 'img'].includes(tag) || /Icon$|Glyph$/.test(tag)) return;
      const aria = stringOf(a.get('aria-label'));
      if (aria) return add(aria, true);
      if (ts.isJsxElement(n)) {
        add(' ');
        n.children.forEach(walkNode);
        add(' ');
      } else if (/^[A-Z]/.test(tag)) {
        // A component with no children draws something we can't read here.
        const lbl = stringOf(a.get('label')) ?? stringOf(a.get('title'));
        if (lbl) add(lbl, true);
      }
    }
  };
  children.forEach(walkNode);
  return [text.replace(/\s+/g, ' ').trim(), dynamic];
}

/** An object-literal `aria={{ label: … }}` prop's label expression. */
function ariaObjectLabel(attrs) {
  const e = exprOf(attrs.get('aria'));
  if (!e || !ts.isObjectLiteralExpression(e)) return null;
  for (const p of e.properties) if (ts.isPropertyAssignment(p) && p.name.getText() === 'label') return p.initializer;
  return null;
}

/**
 * The element's label: { kind: 'static', text } | { kind: 'runtime', template } | { kind: 'none' }.
 * Order: aria-label, an `aria={{ label }}` prop, the visible children, then a `label` or `title` prop.
 */
export function labelInfo(node, attrs) {
  const fromAttr = (attr) => {
    if (!attr) return null;
    const s = stringOf(attr);
    if (s) return { kind: 'static', text: s };
    const e = exprOf(attr);
    return e ? { kind: 'runtime', template: templateOf(e) } : null;
  };
  const aria = fromAttr(attrs.get('aria-label'));
  if (aria) return aria;
  const obj = ariaObjectLabel(attrs);
  if (obj) return isStr(obj) ? { kind: 'static', text: obj.text } : { kind: 'runtime', template: templateOf(obj) };
  if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
    const [text, dynamic] = childText(node.parent.children);
    if (text) return dynamic ? { kind: 'runtime', template: text } : { kind: 'static', text };
  }
  const own = fromAttr(attrs.get('label')) ?? fromAttr(attrs.get('title'));
  if (own) return own;
  // A control inside a <label> is named by the label's words (a checkbox or radio row).
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxElement(p) && p.openingElement.tagName.getText() === 'label' && p.openingElement !== node) {
      const [text, dynamic] = childText(p.children);
      if (text) return dynamic ? { kind: 'runtime', template: text } : { kind: 'static', text };
      break;
    }
  }
  return { kind: 'none' };
}

const labelText = (li) => (li.kind === 'static' ? li.text : li.kind === 'runtime' ? `(run time) ${li.template}` : '(no label)');
const chCodeOf = (attrs) => stringOf(attrs.get('data-ch-code')) ?? stringOf(attrs.get('code'));

/** The data-ctl on an element: { kind: 'literal', id, start, end } (start/end of the id text), 'forward', or null. */
function ctlOf(attrs, sf) {
  const a = attrs.get('data-ctl');
  if (!a) return null;
  const init = a.initializer;
  const lit = (s) => ({ kind: 'literal', id: s.text, start: s.getStart(sf) + 1, end: s.getEnd() - 1 });
  if (init && ts.isStringLiteral(init)) return lit(init);
  const e = exprOf(a);
  if (isStr(e)) return lit(e);
  let found = null;
  const seek = (n) => {
    if (found) return;
    if (isStr(n) && CTL_ANY.test(n.text)) found = lit(n);
    else ts.forEachChild(n, seek);
  };
  if (e) seek(e);
  return found ?? { kind: 'forward' };
}

/** Names of the functions and components that enclose a node, innermost first. */
function enclosingNames(node) {
  const out = [];
  for (let p = node.parent; p; p = p.parent) {
    if ((ts.isFunctionDeclaration(p) || ts.isMethodDeclaration(p)) && p.name) out.push(p.name.getText());
    if (ts.isVariableDeclaration(p) && p.initializer && (ts.isArrowFunction(p.initializer) || ts.isFunctionExpression(p.initializer) || ts.isCallExpression(p.initializer))) out.push(p.name.getText());
  }
  return out;
}

/** Identifiers and property chains (`api.acknowledge`) in the element's props, for linking it to a registered action. */
function identsOf(attrs) {
  const idents = new Set();
  const chains = new Set();
  for (const [name, a] of attrs) {
    if (NOT_IDENT_ATTRS.has(name) || name.startsWith('aria-') || name.startsWith('data-')) continue;
    const e = exprOf(a);
    const seek = (n) => {
      if (ts.isIdentifier(n)) idents.add(n.text);
      if (ts.isPropertyAccessExpression(n)) chains.add(n.getText().replace(/[\s?]/g, ''));
      ts.forEachChild(n, seek);
    };
    if (e) seek(e);
  }
  return { idents, chains };
}

/** Controls in one file, in source order, with everything --assign and the gate need. */
export function scanFile(text, file = 'x.tsx') {
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
      const type = stringOf(attrs.get('type'));
      if (tag === 'input' && ['submit', 'button', 'checkbox', 'radio'].includes(type ?? '')) why.push(`type=${type}`);
      if (why.length) {
        let code = chCodeOf(attrs);
        for (let p = ts.isJsxOpeningElement(node) ? node.parent?.parent : node.parent; !code && p; p = p.parent) {
          const open = ts.isJsxElement(p) ? p.openingElement : ts.isJsxSelfClosingElement(p) ? p : null;
          if (open) code = chCodeOf(attrMap(open));
        }
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const li = labelInfo(node, attrs);
        const href = attrs.get('href');
        rows.push({
          line: line + 1,
          pos: node.getStart(sf),
          insertAt: (node.typeArguments ? node.typeArguments.end + 1 : node.tagName.getEnd()),
          element: tag,
          labelInfo: li,
          label: labelText(li),
          via: [...new Set(why)].join(', '),
          code: code ?? '',
          ctl: ctlOf(attrs, sf),
          href: href ? stringOf(href) ?? `{${nameOf(exprOf(href))}}` : null,
          submit: type === 'submit',
          ...identsOf(attrs),
          within: enclosingNames(node),
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return rows;
}

/** Controls in one file: [{ line, element, label, via, code }], in source order (the map's view). */
export function controlsIn(text, file = 'x.tsx') {
  return scanFile(text, file).map(({ line, element, label, via, code }) => ({
    line,
    element,
    label: label.startsWith('(run time) ') ? '(label built at run time)' : label,
    via,
    code,
  }));
}

/**
 * Which page a file belongs to: the manifest whose implementation path is the longest prefix of it. An exact file in
 * `implementation.also` beats a shared directory (P004 and P005 share src/clubhouse/screens/stats; each lists its own
 * screens' files). A tie between equal paths goes to the lower page id, on purpose rather than by load order.
 */
export function pageOf(file, manifests) {
  let best = null;
  for (const m of manifests) {
    const i = m.implementation ?? {};
    for (const p of [i.root, i.loader, i.route, i.styles, ...(i.also ?? [])].filter(Boolean)) {
      if (!(file === p || file.startsWith(`${p}/`))) continue;
      if (!best || p.length > best.len || (p.length === best.len && m.id < best.m.id)) best = { m, len: p.length };
    }
  }
  return best?.m ?? null;
}

// ── Board verdicts (CLICKABLES.md, 2026-09-30) ──

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** The board rows of CLICKABLES.md: { board, control, alts, status, files }. */
export function parseBoardRows(md) {
  const rows = [];
  let board = '';
  let inTable = false;
  for (const raw of md.split('\n')) {
    const h = /^###\s+(.+)$/.exec(raw);
    if (h) {
      board = h[1].replace(/`/g, '').trim();
      inTable = false;
      continue;
    }
    if (/^\|\s*Control\b/.test(raw)) {
      inTable = true;
      continue;
    }
    if (!inTable) continue;
    if (!raw.startsWith('|')) {
      inTable = false;
      continue;
    }
    if (/^\|\s*-{3}/.test(raw)) continue;
    const cells = raw.slice(1, raw.endsWith('|') ? -1 : undefined).split(' | ').map((c) => c.trim());
    if (cells.length < 4) continue;
    const status = /`([a-zA-Z-]+)`/.exec(cells[3])?.[1];
    if (!status) continue;
    const control = cells[0].replace(/`/g, '');
    const alts = control.split(/\s+\/\s+|,\s+/).map((a) => norm(a.replace(/\([^)]*\)/g, ''))).filter(Boolean);
    const files = [...new Set([...cells[2].matchAll(/src\/clubhouse\/[\w/.[\]-]+\.tsx/g)].map((m) => m[0]))];
    rows.push({ board, control, alts, status, files });
  }
  return rows;
}

/** The board row a control matches: same cited file, and the label names the same thing. Conservative by design. */
export function boardVerdict(file, label, boardRows) {
  const l = norm(label);
  if (!l) return null;
  for (const r of boardRows) {
    if (!r.files.includes(file)) continue;
    const hit = r.alts.some((a) => a === l || (Math.min(a.length, l.length) >= 5 && (a.startsWith(l) || l.startsWith(a))));
    if (hit) return { status: r.status, board: r.board, control: r.control };
  }
  return null;
}

// ── Actions ──

const STOP_TOKENS = new Set(['useAction', 'href', 'submit']);

/** Registered actions this control runs: in the action's component (file#symbol), and naming its handler. */
export function actionsFor(row, file, actions) {
  const out = [];
  for (const a of actions) {
    const [cf, sym] = String(a.component ?? '').split('#');
    if (cf !== file) continue;
    if (sym && !row.within.includes(sym)) continue;
    // Only a handler written as code links a control: "changeWindow", "jr.approveAll", "accept.run / dismiss.run",
    // "submit (useAction stats.setGoal)". Prose ("the Invite players link …") and a bare "href" name no handler, so
    // they link nothing; that is left to the ledger.
    const head = String(a.handler ?? '').replace(/\([^)]*\)/g, ' ').trim();
    const parts = head.split(/\s*(?:\/|,|\bor\b|\band\b)\s*/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length || !parts.every((p) => /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(p))) continue;
    const tokens = parts.filter((t) => !STOP_TOKENS.has(t));
    const byCode = tokens.some((t) => (t.includes('.') ? row.chains.has(t) : row.idents.has(t)));
    const bySubmit = parts.includes('submit') && row.submit;
    if (byCode || bySubmit) out.push(a.id);
  }
  return out;
}

// ── Roles, viewports, descriptions ──

function roleFor(file, m) {
  if (!m) return 'both';
  const aud = new Set();
  for (const s of m.screens ?? []) {
    for (const [who, ref] of [['coach', s.coach], ['player', s.player], ['visitor', s.visitor]]) if (ref && ref.split('#')[0] === file) aud.add(who);
  }
  const roles = aud.size ? [...aud] : (m.roles ?? []);
  if (!roles.length) return 'visitor';
  if (roles.includes('coach') && roles.includes('player')) return 'both';
  return roles.length === 1 ? roles[0] : roles.sort().join('+');
}

function viewportFor(file) {
  const base = file.split('/').pop();
  if (/\/phone\//.test(file) || /Phone|Mobile/.test(base)) return 'phone';
  if (/^Desk|Desk[A-Z.]/.test(base)) return 'desktop';
  return 'all';
}

function describe(row, label, acts, actionLabels) {
  if (acts.length) return acts.map((id) => actionLabels.get(id)).join('; ');
  const name = label ? `"${label}"` : 'This control';
  if (row.href) return row.href.startsWith('{') ? `${name}: opens the link from ${row.href.slice(1, -1)}` : `${name}: goes to ${row.href}`;
  const kind = /role=(\w+)/.exec(row.via)?.[1] ?? (/link/.test(row.via) ? 'link' : row.element === 'input' ? 'input' : 'button');
  return `${name} ${kind}`;
}

// ── Loading ──

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

/** The ledgers: { P###: { page, controls: [...], tombstones: [...] } }. */
export function loadLedgers(root) {
  const dir = join(root, LEDGER_DIR);
  const out = {};
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir).sort()) {
    const m = /^(P\d{3})\.json$/.exec(n);
    if (m) out[m[1]] = JSON.parse(readFileSync(join(dir, n), 'utf8'));
  }
  return out;
}

export function renderLedger(prefix, ledger) {
  const body = (list) => (list.length ? `[\n${list.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n ]` : '[]');
  const head = prefix === SHARED_PAGE ? 'Shared controls (files no page manifest claims)' : `Controls first numbered on ${prefix}`;
  return `{\n "$comment": ${JSON.stringify(`${head}. Ids are permanent; written by node scripts/clubhouse/clickable-map.mjs --assign. label, labelTemplate and description are yours to edit; the rest is derived from the code.`)},\n "prefix": ${JSON.stringify(prefix)},\n "controls": ${body(ledger.controls)},\n "tombstones": ${body(ledger.tombstones)}\n}\n`;
}

const idNum = (id) => Number(CTL_RE.exec(id)?.[2] ?? 0);
const idPrefix = (id) => CTL_RE.exec(id)?.[1] ?? null;
const fmtId = (prefix, n) => `CTL-${prefix}-${String(n).padStart(3, '0')}`;

/**
 * The assignment, pure. `files` maps repo paths to text; `ledgers` as loadLedgers returns. Returns { edits, ledgers,
 * controls } where edits maps a file to its new text (only files that change), ledgers are the new ledgers by prefix,
 * and controls lists every scanned control with its id (null for a forwarder) and ledger entry.
 * `only` limits numbering to files on one page (P000 = Shared); the rest are read for collisions and left alone.
 */
export function assign({ files, manifests, ledgers = {}, boardMd = '', today = '1970-01-01', only = null }) {
  const boardRows = parseBoardRows(boardMd);
  const actions = manifests.flatMap((m) => m.actions ?? []);
  const actionLabels = new Map(actions.map((a) => [a.id, a.label]));
  const byId = new Map();
  const tomb = new Set();
  for (const [prefix, l] of Object.entries(ledgers)) {
    for (const e of l.controls ?? []) byId.set(e.id, { ...e, _prefix: prefix });
    for (const t of l.tombstones ?? []) tomb.add(t.id);
  }
  const next = new Map();
  const bump = (prefix, n) => next.set(prefix, Math.max(next.get(prefix) ?? 0, n));
  for (const id of [...byId.keys(), ...tomb]) bump(idPrefix(id), idNum(id));

  const scanned = [];
  for (const file of Object.keys(files).sort()) {
    const m = pageOf(file, manifests);
    const page = m?.id ?? SHARED_PAGE;
    for (const row of scanFile(files[file], file)) scanned.push({ file, m, page, row });
  }
  for (const s of scanned) if (s.row.ctl?.kind === 'literal' && CTL_RE.test(s.row.ctl.id)) bump(idPrefix(s.row.ctl.id), idNum(s.row.ctl.id));

  // Pass 1: keep each valid, untombstoned literal on its first occurrence.
  const seen = new Set();
  for (const s of scanned) {
    const c = s.row.ctl;
    if (c?.kind !== 'literal') continue;
    if (CTL_RE.test(c.id) && !tomb.has(c.id) && !seen.has(c.id)) {
      seen.add(c.id);
      s.id = c.id;
    }
  }
  // Pass 2: everything else (on the pages being numbered) gets the next free number on its page.
  const edits = new Map();
  for (const s of scanned) {
    if (s.id || s.row.ctl?.kind === 'forward') continue;
    if (only && s.page !== only) continue;
    const n = (next.get(s.page) ?? 0) + 1;
    next.set(s.page, n);
    s.id = fmtId(s.page, n);
    const list = edits.get(s.file) ?? [];
    list.push(s.row.ctl?.kind === 'literal' ? { start: s.row.ctl.start, end: s.row.ctl.end, text: s.id } : { start: s.row.insertAt, end: s.row.insertAt, text: ` data-ctl="${s.id}"` });
    edits.set(s.file, list);
  }

  const out = {};
  for (const [prefix, l] of Object.entries(ledgers)) out[prefix] = { controls: [], tombstones: [...(l.tombstones ?? [])] };
  const live = new Set();
  for (const s of scanned) {
    if (!s.id) continue;
    live.add(s.id);
    const prefix = idPrefix(s.id);
    const old = byId.get(s.id) ?? {};
    const li = s.row.labelInfo;
    const label = li.kind === 'static' ? li.text : old.label ?? null;
    const labelTemplate = li.kind === 'runtime' ? old.labelTemplate ?? li.template : old.labelTemplate ?? null;
    const acts = actionsFor(s.row, s.file, actions);
    const entry = {
      id: s.id,
      page: s.page,
      file: s.file,
      element: s.row.element,
      label,
      ...(labelTemplate && li.kind !== 'static' ? { labelTemplate } : {}),
      description: old.description ?? describe(s.row, label ?? (labelTemplate ? labelTemplate : null), acts, actionLabels),
      role: roleFor(s.file, s.m),
      viewport: viewportFor(s.file),
      actions: acts,
      verdict: boardVerdict(s.file, label ?? '', boardRows),
      ...(s.row.code ? { code: s.row.code } : {}),
      via: s.row.via,
    };
    (out[prefix] ??= { controls: [], tombstones: [] }).controls.push(entry);
  }
  // A ledger id no longer in the code is tombstoned (when --page limits the run, only that page's files count).
  for (const [id, old] of byId) {
    if (live.has(id)) continue;
    if (only && old.page !== only) {
      out[old._prefix].controls.push(stripPrivate(old));
      continue;
    }
    out[old._prefix].tombstones.push({ id, file: old.file, label: old.label ?? old.labelTemplate ?? null, removedAt: today });
  }
  for (const l of Object.values(out)) {
    l.controls.sort((a, b) => idNum(a.id) - idNum(b.id));
    l.tombstones.sort((a, b) => idNum(a.id) - idNum(b.id));
  }

  const newFiles = {};
  for (const [file, list] of edits) {
    let text = files[file];
    for (const e of [...list].sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
    newFiles[file] = text;
  }
  return { edits: newFiles, ledgers: out, controls: scanned };
}

const stripPrivate = (e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('_')));

/** Problems with the numbering and labels, for clubhouse:check. Empty when every control is numbered and labelled. */
export function controlProblems({ files, manifests, ledgers, boardMd = '' }) {
  const v = [];
  const res = assign({ files, manifests, ledgers, boardMd, today: 'check' });
  for (const s of res.controls) {
    const where = `${s.file}:${s.row.line} <${s.row.element}>`;
    if (s.row.ctl?.kind === 'forward') continue;
    if (!s.row.ctl) v.push(`${where} has no data-ctl; run npm run clubhouse:controls`);
    else if (s.row.ctl.id !== s.id) v.push(`${where} data-ctl="${s.row.ctl.id}" is ${CTL_RE.test(s.row.ctl.id) ? 'taken or tombstoned' : 'not a CTL-P###-NNN id'}; run npm run clubhouse:controls`);
  }
  for (const [prefix, l] of Object.entries(res.ledgers)) {
    const before = ledgers[prefix];
    if (!before || renderLedger(prefix, before) !== renderLedger(prefix, l)) v.push(`${LEDGER_DIR}/${prefix}.json is out of date with the code; run npm run clubhouse:controls`);
    for (const e of l.controls) {
      if (!e.label && !e.labelTemplate) v.push(`${e.id} (${e.file}, <${e.element}>) has no label: give it an aria-label or text in the code, or a label in ${LEDGER_DIR}/${prefix}.json`);
    }
  }
  return v;
}

// ── The map ──

/** One control on one list line, at most 80 columns: id, line, element, label, reason, code. */
function mapLine(r, id) {
  const head = `- ${id ? `${id} ` : ''}${r.line} \`${r.element}\` `;
  const tail = ` (${r.via})${r.code ? ` ${r.code}` : ''}`;
  const room = MAX_LINE - head.length - tail.length - 2;
  return `${head}"${clip(plain(r.label), Math.max(8, room))}"${tail}`;
}

/** `files` maps repo-relative .tsx paths to their text; `ledgers` (optional) names the controls the code can't. */
export function buildMap({ files, manifests, ledgers = null }) {
  const ledgerById = new Map();
  for (const l of Object.values(ledgers ?? {})) for (const e of l.controls ?? []) ledgerById.set(e.id, e);
  const byPage = new Map();
  for (const file of Object.keys(files).sort()) {
    const rows = scanFile(files[file], file);
    if (!rows.length) continue;
    const m = pageOf(file, manifests);
    const key = m ? `${m.id} ${m.name}` : 'Shared (no page manifest claims these files)';
    if (!byPage.has(key)) byPage.set(key, []);
    byPage.get(key).push({ file, rows });
  }
  const keys = [...byPage.keys()].sort((a, b) => (a.startsWith('Shared') ? 1 : b.startsWith('Shared') ? -1 : a.localeCompare(b)));
  let out = '# Clubhouse clickable map\n\n<!-- Generated by node scripts/clubhouse/clickable-map.mjs. Do not edit;\nchange the code, the manifests under config/clubhouse/pages/ or the\nledgers under config/clubhouse/controls/. -->\n\n';
  out += [
    'Every interactive control in `src/clubhouse` (tests and previews left out),',
    'per page:',
    'a button or link by tag, or a JSX element with `onClick`, `onPress`,',
    '`onPointerDown`, `href` or a control role. A line reads: the control id',
    '(`data-ctl`, its ledger entry in `config/clubhouse/controls/`), source line,',
    'element, label, what makes it a control, then the nearest `data-ch-code` or',
    '`code` prop (on the element or an ancestor) when there is one. A label built',
    'at run time reads as its template, `{name}` where a value goes; a label only',
    'the ledger knows is marked `(ledger)`. `forwards` marks a shared component\'s',
    'element that carries its caller\'s id. This supersedes the 2026-09-30',
    'snapshot in [CLICKABLES.md](../CLICKABLES.md).',
  ].join('\n') + '\n';
  const all = [...byPage.values()].flat();
  const total = all.reduce((n, f) => n + f.rows.length, 0);
  const fwd = all.reduce((n, f) => n + f.rows.filter((r) => r.ctl?.kind === 'forward').length, 0);
  out += `\n${total} controls in ${all.length} files; ${fwd} forward their caller's id.\n`;
  for (const key of keys) {
    const group = byPage.get(key);
    out += `\n## ${key}\n\n${group.reduce((n, f) => n + f.rows.length, 0)} controls.\n`;
    for (const { file, rows } of group) {
      out += `\n### \`${file}\`\n\n`;
      for (const r of rows) {
        const id = r.ctl?.kind === 'literal' ? r.ctl.id : r.ctl?.kind === 'forward' ? 'forwards' : null;
        const e = r.ctl?.kind === 'literal' ? ledgerById.get(r.ctl.id) : null;
        let label = r.labelInfo.kind === 'static' ? r.labelInfo.text : r.labelInfo.kind === 'runtime' ? r.labelInfo.template : '(no label)';
        if (r.labelInfo.kind === 'none' && e?.label) label = `${e.label} (ledger)`;
        out += `${mapLine({ ...r, label }, id)}\n`;
      }
    }
  }
  return out;
}

// ── Disk ──

function context(root) {
  const files = walk(root, 'src/clubhouse');
  const manifests = loadManifests(root);
  const ledgers = loadLedgers(root);
  const boardPath = join(root, 'docs/clubhouse/CLICKABLES.md');
  const boardMd = existsSync(boardPath) ? readFileSync(boardPath, 'utf8') : '';
  return { files, manifests, ledgers, boardMd };
}

/** clubhouse:check: the map matches the code, and every control is numbered and labelled (§4.7). Never throws. */
export function checkClickableMap(root) {
  const ctx = context(root);
  const v = [];
  const text = buildMap(ctx);
  const path = join(root, OUT);
  if (!existsSync(path) || readFileSync(path, 'utf8') !== text) v.push(`${OUT} is stale: the controls in src/clubhouse changed; run npm run clubhouse:clickables`);
  return v;
}

/** clubhouse:check, D11: every control has a data-ctl and a label, and the ledgers match the code. */
export function checkControls(root) {
  return controlProblems(context(root));
}

/** Run --assign against the disk: write code edits, ledgers and the map. Returns a summary. */
export function assignOnDisk(root, { only = null, today = new Date().toISOString().slice(0, 10) } = {}) {
  const ctx = context(root);
  const res = assign({ ...ctx, today, only });
  for (const [file, text] of Object.entries(res.edits)) writeFileSync(join(root, file), text);
  mkdirSync(join(root, LEDGER_DIR), { recursive: true });
  let ledgerWrites = 0;
  for (const [prefix, l] of Object.entries(res.ledgers)) {
    const p = join(root, LEDGER_DIR, `${prefix}.json`);
    const text = renderLedger(prefix, l);
    if (!existsSync(p) || readFileSync(p, 'utf8') !== text) {
      writeFileSync(p, text);
      ledgerWrites += 1;
    }
  }
  const files = { ...ctx.files, ...res.edits };
  const map = buildMap({ files, manifests: ctx.manifests, ledgers: res.ledgers });
  mkdirSync(dirname(join(root, OUT)), { recursive: true });
  writeFileSync(join(root, OUT), map);
  const numbered = res.controls.filter((s) => s.id && s.row.ctl?.id !== s.id).length;
  return { files: Object.keys(res.edits).length, numbered, ledgerWrites };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
  const args = process.argv.slice(2);
  if (args.includes('--assign')) {
    const i = args.indexOf('--page');
    const only = i > -1 ? args[i + 1] : null;
    const r = assignOnDisk(root, { only });
    console.log(`--assign${only ? ` --page ${only}` : ''}: ${r.numbered} control(s) numbered in ${r.files} file(s), ${r.ledgerWrites} ledger(s) written; map rewritten.`);
    return;
  }
  const ctx = context(root);
  const text = buildMap(ctx);
  const path = join(root, OUT);
  if (args.includes('--check')) {
    const v = [...checkClickableMap(root), ...checkControls(root)];
    if (v.length) {
      console.error(`clickable map: ${v.length} problem(s):`);
      for (const x of v.slice(0, 50)) console.error(`  ${x}`);
      process.exit(1);
    }
    console.log(`${OUT} is current; every control is numbered and labelled.`);
    return;
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  console.log(`wrote ${relative(root, path)} (${text.split('\n').length} lines)`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
