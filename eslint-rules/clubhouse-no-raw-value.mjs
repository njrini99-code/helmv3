/**
 * clubhouse-no-raw-value — colour and size literals in Clubhouse modules
 * (design lab GAP-S2 and E §6.2, dsx-09).
 *
 * Clubhouse paints through its scoped tokens (`src/clubhouse/styles/tokens.css`,
 * `var(--ch-*)`) so a theme, a density or a contrast change reaches every
 * screen. A colour or size written straight into a module skips that: dark
 * mode misses it, the type scale misses it, and no CSS ratchet sees it. This
 * rule finds, in src/clubhouse TS and TSX:
 *
 *   - colour literals (`#1e6a45`, `rgb(…)`, `hsl(…)`, `oklch(…)`, `white`,
 *     `black`) in a JSX `style`, in an SVG paint attribute (fill, stroke,
 *     stopColor, color, floodColor, lightingColor), or assigned through
 *     `style.x = …` / `style.setProperty(…)`;
 *   - size literals in a JSX `style`: a number or a `px`/`rem`/`em` string on
 *     a box, type, radius, inset or z-index property (0 and unitless ratios
 *     such as flex or opacity are fine); a custom property set to a `px`
 *     literal counts too;
 *   - Tailwind arbitrary values in className (`text-[13px]`, `bg-[#fff]`).
 *
 * Values computed from data (`${pct}%`, `width: w`) are not literals and pass.
 *
 * Ratchet: the counts per file on main live in
 * config/clubhouse/tsx-raw-values.json and may only fall. A file over its
 * count reports every literal; a file under it asks for the baseline to be
 * lowered (`npm run clubhouse:raw-values -- --update`), so a fixed literal
 * cannot quietly come back. A file not listed is allowed none.
 *
 * Options: [{ baseline?: Record<string, number>, reportAll?: boolean }]
 * `reportAll` reports every literal regardless of the baseline (used by the
 * update script to count).
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const BASELINE_FILE = 'config/clubhouse/tsx-raw-values.json';

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const FUNC = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(\s*[-\d.]/i;
const NAMED = /^\s*(?:white|black)\s*$/i;
const PX = /(?:^|[\s(,])-?\d*\.?\d+(?:px|rem|em)\b/;
const ARBITRARY_CLASS = /(?:^|\s|:)[a-z-]+-\[(?:#[0-9a-fA-F]{3,8}|-?\d*\.?\d+(?:px|rem|em)|rgba?\([^\]]*\))\]/;

const PAINT_ATTRS = new Set(['fill', 'stroke', 'stopColor', 'color', 'floodColor', 'lightingColor']);
/** Style properties where a bare number means pixels (React adds px). */
const SIZE_PROPS = /^(?:width|height|min(?:Width|Height)|max(?:Width|Height)|inset|top|right|bottom|left|(?:padding|margin)(?:Top|Right|Bottom|Left|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?|gap|rowGap|columnGap|fontSize|letterSpacing|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|borderWidth|outlineWidth|outlineOffset|zIndex|flexBasis)$/;

export const isColourLiteral = (s) => HEX.test(s) || FUNC.test(s) || NAMED.test(s);

/** The static string of a Literal or a TemplateLiteral's quasis (expressions dropped). */
function staticText(node) {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral') return node.quasis.map((q) => q.value.cooked ?? '').join(' ');
  return undefined;
}

const keyName = (p) => {
  if (p.type !== 'Property') return undefined;
  if (p.key.type === 'Identifier') return p.key.name;
  if (p.key.type === 'Literal') return String(p.key.value);
  return undefined;
};

/** A computed key such as ['--ch-x' as string] or ['--ch-x']. */
const computedKey = (p) => {
  if (p.type !== 'Property' || !p.computed) return undefined;
  let k = p.key;
  if (k.type === 'TSAsExpression') k = k.expression;
  return k.type === 'Literal' ? String(k.value) : undefined;
};

/** Paths are reported relative to the repo, with forward slashes, to match the baseline. */
function repoPath(filename, cwd) {
  return relative(cwd, filename).split(sep).join('/');
}

let cachedBaseline;
function loadBaseline(cwd) {
  if (cachedBaseline) return cachedBaseline;
  const p = join(cwd, BASELINE_FILE);
  cachedBaseline = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')).files ?? {} : {};
  return cachedBaseline;
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'Clubhouse modules paint and size through --ch-* tokens, not literals (ratcheted per file).' },
    messages: {
      colour: 'Colour literal "{{ value }}" in a Clubhouse module: use a --ch-* token (var(--ch-…)) so dark mode and contrast reach it. {{ count }}',
      size: 'Size literal "{{ value }}" on {{ prop }} in a Clubhouse style: use a --ch-* token or a class in the page stylesheet. {{ count }}',
      arbitrary: 'Tailwind arbitrary value "{{ value }}" in a Clubhouse className: use a .ch-* class and tokens. {{ count }}',
      shrink: 'This file has {{ now }} raw colour or size literal(s), under its baseline of {{ was }} in {{ file }}. Lower it: npm run clubhouse:raw-values -- --update',
    },
    schema: [
      {
        type: 'object',
        properties: { baseline: { type: 'object' }, reportAll: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const opts = context.options[0] ?? {};
    const cwd = context.cwd ?? process.cwd();
    const file = repoPath(context.filename ?? '', cwd);
    const found = [];
    const push = (node, messageId, data) => found.push({ node, messageId, data });

    const checkColour = (valueNode) => {
      const s = staticText(valueNode);
      if (s !== undefined && isColourLiteral(s)) push(valueNode, 'colour', { value: s.trim().slice(0, 40) });
    };

    const checkStyleObject = (obj) => {
      for (const p of obj.properties) {
        if (p.type !== 'Property') continue;
        const v = p.value;
        const name = keyName(p) ?? computedKey(p);
        const s = staticText(v);
        if (s !== undefined && isColourLiteral(s)) {
          push(v, 'colour', { value: s.trim().slice(0, 40) });
          continue;
        }
        if (!name) continue;
        const isNum = v.type === 'Literal' && typeof v.value === 'number' && v.value !== 0;
        const isNeg = v.type === 'UnaryExpression' && v.argument.type === 'Literal' && typeof v.argument.value === 'number';
        if (SIZE_PROPS.test(name) && (isNum || isNeg)) push(v, 'size', { value: context.sourceCode.getText(v), prop: name });
        else if ((SIZE_PROPS.test(name) || name.startsWith('--')) && s !== undefined && v.type === 'Literal' && PX.test(s)) {
          push(v, 'size', { value: s.slice(0, 40), prop: name });
        }
      }
    };

    return {
      JSXAttribute(node) {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : undefined;
        const val = node.value;
        if (!name || !val) return;
        const expr = val.type === 'JSXExpressionContainer' ? val.expression : val;
        if (name === 'style') {
          if (expr.type === 'ObjectExpression') checkStyleObject(expr);
        } else if (PAINT_ATTRS.has(name)) {
          checkColour(expr);
        } else if (name === 'className') {
          const s = staticText(expr);
          if (s !== undefined) {
            const m = s.match(ARBITRARY_CLASS);
            if (m) push(expr, 'arbitrary', { value: m[0].trim() });
          }
        }
      },
      // el.style.color = '#fff' / el.style.setProperty('--ch-x', '#fff')
      AssignmentExpression(node) {
        const l = node.left;
        if (l.type === 'MemberExpression' && l.object.type === 'MemberExpression' && l.object.property.name === 'style') checkColour(node.right);
      },
      CallExpression(node) {
        const c = node.callee;
        if (c.type === 'MemberExpression' && c.property.name === 'setProperty' && node.arguments[1]) checkColour(node.arguments[1]);
      },
      'Program:exit'(program) {
        const now = found.length;
        if (opts.reportAll) {
          for (const f of found) context.report({ node: f.node, messageId: f.messageId, data: { ...f.data, count: '' } });
          return;
        }
        const baseline = opts.baseline ?? loadBaseline(cwd);
        const was = baseline[file] ?? 0;
        if (now > was) {
          const count = `(${now} in this file, baseline ${was}: the count may only fall)`;
          for (const f of found) context.report({ node: f.node, messageId: f.messageId, data: { ...f.data, count } });
        } else if (now < was) {
          context.report({ node: program, loc: { line: 1, column: 0 }, messageId: 'shrink', data: { now, was, file: BASELINE_FILE } });
        }
      },
    };
  },
};
