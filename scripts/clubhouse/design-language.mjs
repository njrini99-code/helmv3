#!/usr/bin/env node
/**
 * The token tables in design-refresh/DESIGN_LANGUAGE.md, generated from src/clubhouse/styles/tokens.css.
 *
 * DESIGN_LANGUAGE.md is the Clubhouse design system: the laws and rules are prose, and every value it quotes (page,
 * cards, ink, edges, chart marks, keys, the toggle, the three elevations, radii and type roles) comes from this
 * script, with its WCAG contrast measured against the card and the page in both themes. A value changes in
 * tokens.css, never in the doc; `clubhouse:check` fails when the block and the tokens drift apart.
 *
 * Usage: node scripts/clubhouse/design-language.mjs           rewrite the block
 *        node scripts/clubhouse/design-language.mjs --check   exit 1 when the block is stale
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';

export const DOC = 'design-refresh/DESIGN_LANGUAGE.md';
export const TOKENS = 'src/clubhouse/styles/tokens.css';
const START = '<!-- AUTOGEN:clubhouse-design-tokens:start (node scripts/clubhouse/design-language.mjs; do not edit inside) -->';
const END = '<!-- AUTOGEN:clubhouse-design-tokens:end -->';
const LIGHT = "[data-ui='clubhouse']";
const DARK = "html[data-fw-theme='dark'] [data-ui='clubhouse']";

/** The light and dark root declarations of tokens.css (phone, contrast and transparency blocks are not the system). */
export function readTokens(css) {
  const light = new Map();
  const dark = new Map();
  // The type roles' phone values (MOTION-AND-VISUAL 4.3): the light root's type tokens redefined in the phone block.
  const phoneType = new Map();
  const root = postcss.parse(css);
  root.each((node) => {
    if (node.type !== 'rule') return;
    const into = node.selector === LIGHT ? light : node.selector === DARK ? dark : null;
    if (!into) return;
    node.each((d) => {
      if (d.type === 'decl' && d.prop.startsWith('--')) into.set(d.prop, d.value.replace(/\s+/g, ' ').trim());
    });
  });
  root.each((node) => {
    if (node.type !== 'atrule' || node.name !== 'media' || !node.params.startsWith('(max-width: 820px)')) return;
    node.walkRules((rule) => {
      if (rule.selector !== LIGHT) return;
      rule.each((d) => {
        if (d.type === 'decl' && d.prop.startsWith('--ch-type-')) phoneType.set(d.prop, d.value.replace(/\s+/g, ' ').trim());
      });
    });
  });
  return { light, dark, phoneType };
}

/** A token's value in a theme after following plain var() aliases (dark falls back to light). */
function resolve(tokens, name, theme, depth = 0) {
  const value = (theme === 'dark' ? tokens.dark.get(name) : undefined) ?? tokens.light.get(name);
  if (value === undefined) return undefined;
  const alias = value.match(/^var\((--[\w-]+)\)$/);
  return alias && depth < 12 ? resolve(tokens, alias[1], theme, depth + 1) ?? value : value;
}

/** Inline var() references inside a compound value (a shadow list), one level at a time. */
function expand(tokens, value, theme, depth = 0) {
  if (!value || depth > 6) return value;
  return value.replace(/var\((--[\w-]+)\)/g, (whole, name) => {
    const v = resolve(tokens, name, theme);
    return v && !/gradient|color-mix/.test(v) ? expand(tokens, v, theme, depth + 1) : whole;
  });
}

/** #rgb, #rrggbb, #rrggbbaa or rgb(r g b / a) to [r, g, b, a]; anything else (a gradient, a mix) is undefined. */
export function parseColour(value) {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1);
  m = v.match(/^#([0-9a-f]{6})([0-9a-f]{2})?$/);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).concat(m[2] ? parseInt(m[2], 16) / 255 : 1);
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)$/);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1], +m[2], +m[3], a];
  }
  if (v === '#fff' || v === 'white') return [255, 255, 255, 1];
  return undefined;
}

const over = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3])).concat(1);
const lum = (c) => {
  const [r, g, b] = c.slice(0, 3).map((x) => {
    const s = x / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2.x contrast of a colour (alpha composited) on an opaque background. */
export function contrast(fg, bg) {
  const a = lum(over(fg, bg));
  const b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const code = (v) => (v === undefined ? '—' : '`' + v.replaceAll('|', '\\|') + '`');
const ratio = (r) => (r === undefined ? '—' : r.toFixed(2));

/**
 * Rows: [token, role, on] where `on` names the surfaces the ratio is measured against (tokens), or 'page-ratio' for a
 * surface measured against the linen page.
 */
const SURFACES = [
  ['--ch-workspace', 'The linen page, under the light and the paper tint (S1.1)'],
  ['--ch-bg-page', 'The recessed page: desktop main column, inset grouped lists (S1.2)'],
  ['--ch-card-bg', 'The one card; `--ch-bg-surface`, sheets, the chart paper and bubbles name it (S1.3)'],
  ['--ch-bg-surface', 'Same card'],
  ['--ch-bg-elevated', 'Raised surfaces: menus, popovers, the secondary key (S1.6)'],
  ['--ch-bg-subtle', 'Tiles and wells inside a card; `--ch-well-bg-flat` names it'],
  ['--ch-bg-selected', 'Selected row or option, always with a non-colour cue (S1.8b)'],
  ['--ch-feature-bg', 'The one deep green feature card per view'],
];
const INK = [
  ['--ch-text-primary', 'Titles, values', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-text-secondary', 'Meta, notes, row subtitles', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-text-tertiary', 'Axis labels, timestamps; never a sentence', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-ink-500', 'Placeholder and the quietest text (S1.7)', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-accent-ink', 'Links and accent text; `--ch-accent` is the fill, never text', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-on-green-ink', 'Text on the green frame and feature card', ['--ch-feature-bg']],
  ['--ch-text-on-accent', 'Text on a primary key', ['--ch-primary-bg']],
];
const EDGES = [
  ['--ch-card-ring', 'The card edge, drawn as `0 0 0 1px` (S1.4); a boundary, not a 3:1 line', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-separator', 'Row hairlines, inset 16 from the leading edge', ['--ch-card-bg']],
  ['--ch-border-control', 'Inputs, search, chips, switch off-ring, chart track rings (S1.8, 3:1)', ['--ch-card-bg', '--ch-workspace']],
  ['--ch-border-focus', 'Keyboard focus ring, 2px', ['--ch-card-bg', '--ch-workspace']],
];
const DATA = [
  ['--ch-chart-gain', 'Gain text and signed numbers (S2.5)', ['--ch-card-bg']],
  ['--ch-chart-loss', 'Loss text and signed numbers (S2.5)', ['--ch-card-bg']],
  ['--ch-chart-gain-fill', 'Gain bars and marks', ['--ch-card-bg', '--ch-chart-track']],
  ['--ch-chart-loss-fill', 'Loss bars and marks; 3:1 on the card and on the track itself', ['--ch-card-bg', '--ch-chart-track']],
  ['--ch-chart-flat', 'Steady or within-noise marks, drawn in ink', ['--ch-card-bg', '--ch-chart-track']],
  ['--ch-chart-line', 'The series line, 2px, one dot on the newest round (S2.4)', ['--ch-card-bg']],
  ['--ch-chart-zero', 'Mean and zero rules, 1px dashed', ['--ch-card-bg']],
  ['--ch-separator-chart', 'Gridlines, 1px, dashed 2 4, at most three (S2.2)', ['--ch-card-bg']],
  ['--ch-chart-track', 'Bar and progress tracks, ringed with `--ch-chart-track-ring` (S2.6)', ['--ch-card-bg']],
  ['--ch-chart-par', 'Par segments, ringed like the track', ['--ch-card-bg']],
  ['--ch-chart-gilt', 'Qualifying line and its legend key', ['--ch-card-bg']],
  ['--ch-score-under', 'Under par, text and rings: the gain (MOTION-AND-VISUAL 4.7)', ['--ch-card-bg']],
  ['--ch-score-under-fill', 'A filled under-par mark or hole chip, under `--ch-score-fill-ink` (4.7)', ['--ch-card-bg', '--ch-score-fill-ink']],
  ['--ch-score-birdie-fill', 'The scoring mix and live beads: birdie, a step lighter than eagle or better', ['--ch-card-bg', '--ch-score-eagle-fill']],
  ['--ch-champagne-100', 'Attention (4.7): a due date and the personal-best badge, with `--ch-champagne-ink`', ['--ch-card-bg', '--ch-champagne-ink']],
  ['--ch-chart-flag', 'The pin flag, drawn as on the course', ['--ch-card-bg']],
  ['--ch-flag', 'Errors and destructive actions: red means nothing else (4.7)', ['--ch-card-bg']],
];
const KEYS = [
  ['--ch-primary-bg', 'Primary key, solid (no gradient)', ['--ch-card-bg']],
  ['--ch-primary-bg-hover', 'Primary key, hover', ['--ch-card-bg']],
  ['--ch-primary-bg-press', 'Primary key, pressed', ['--ch-card-bg']],
  ['--ch-btn-secondary-bg', 'Secondary key', ['--ch-card-bg']],
];
const TOGGLE = [
  ['--ch-well-bg', 'The toggle well (recessed linen)'],
  ['--ch-well-shadow', 'Its inset'],
  ['--ch-seg-on-bg', 'The raised green pill'],
  ['--ch-seg-on-shadow', 'Its soft drop shadow'],
  ['--ch-seg-on-ink', 'The pill label'],
];
const ELEVATION = [
  ['--ch-elevation-card', 'Card: every card (MOTION-AND-VISUAL 4.6). Flat, the page, is none'],
  ['--ch-elevation-raised', 'Raised: sheets, menus, the palette, pins, toasts (MOTION-AND-VISUAL 4.6)'],
  ['--ch-scrim', 'The scrim under a sheet or dialog'],
];
const TYPE = [
  ['--ch-type-large-title', 'Large title: the page title'],
  ['--ch-type-title', 'Title: card hero titles, a hole number'],
  ['--ch-type-headline', 'Headline: card heads, bar titles, row titles that lead'],
  ['--ch-type-body', 'Body: prose, CoachHelm answers'],
  ['--ch-type-callout', 'Callout: row titles, controls, secondary prose'],
  ['--ch-type-footnote', 'Footnote: row meta, eyebrows, captions under figures'],
  ['--ch-type-caption', 'Caption: axis labels, legends, chips'],
  ['--ch-type-figure-hero', 'Hero figure, tabular: the one number a screen leads with'],
  ['--ch-type-figure', 'Row figure, tabular: scores and averages in rows'],
];

function colourOf(tokens, name, theme) {
  return parseColour(resolve(tokens, name, theme));
}

function surfaceTable(tokens) {
  const head = '| Token | Light | Dark | Role | On the page, light | On the page, dark |\n|---|---|---|---|---|---|';
  const rows = SURFACES.map(([name, role]) => {
    const cells = ['light', 'dark'].map((t) => {
      const c = colourOf(tokens, name, t);
      const page = colourOf(tokens, '--ch-workspace', t);
      return c && page && name !== '--ch-workspace' ? ratio(contrast(c, page)) : '—';
    });
    return `| \`${name}\` | ${code(resolve(tokens, name, 'light'))} | ${code(resolve(tokens, name, 'dark'))} | ${role} | ${cells[0]} | ${cells[1]} |`;
  });
  return [head, ...rows].join('\n');
}

function measuredTable(tokens, list) {
  const head = '| Token | Light | Dark | Role | Light ratios | Dark ratios |\n|---|---|---|---|---|---|';
  const rows = list.map(([name, role, on]) => {
    const cells = ['light', 'dark'].map((t) => {
      const fg = colourOf(tokens, name, t);
      if (!fg) return '—';
      return on
        .map((bgName) => {
          const bg = colourOf(tokens, bgName, t);
          return bg ? `${ratio(contrast(fg, bg))} on ${bgName.replace('--ch-', '')}` : null;
        })
        .filter(Boolean)
        .join(', ');
    });
    return `| \`${name}\` | ${code(resolve(tokens, name, 'light'))} | ${code(resolve(tokens, name, 'dark'))} | ${role} | ${cells[0]} | ${cells[1]} |`;
  });
  return [head, ...rows].join('\n');
}

function valueTable(tokens, list, { expandVars = false } = {}) {
  const head = '| Token | Light | Dark | Role |\n|---|---|---|---|';
  const rows = list.map(([name, role]) => {
    const [l, d] = ['light', 'dark'].map((t) => (expandVars ? expand(tokens, resolve(tokens, name, t), t) : resolve(tokens, name, t)));
    return `| \`${name}\` | ${code(l)} | ${l === d ? 'same' : code(d)} | ${role} |`;
  });
  return [head, ...rows].join('\n');
}

function radiusTable(tokens) {
  const names = [...tokens.light.keys()].filter((n) => n.startsWith('--ch-radius-'));
  const head = '| Token | Value |\n|---|---|';
  return [head, ...names.map((n) => `| \`${n}\` | ${code(resolve(tokens, n, 'light'))} |`)].join('\n');
}

function typeTable(tokens) {
  const head = '| Role | Token | Desktop: weight, size / leading | Phone: weight, size / leading |\n|---|---|---|---|';
  const cell = (v) => {
    const m = (v ?? '').match(/^(\d{3}) calc\((\d+) \* var\(--ch-type-k\)\)\/(?:calc\((\d+) \* var\(--ch-type-k\)\)|([\d.]+))/);
    return m ? `${m[1]}, ${m[2]} / ${m[3] ?? m[4]}` : '—';
  };
  const rows = TYPE.map(([name, role]) => {
    const desk = cell(resolve(tokens, name, 'light'));
    const phone = tokens.phoneType?.has(name) ? cell(tokens.phoneType.get(name)) : 'same';
    return `| ${role} | \`${name}\` | ${desk} | ${phone} |`;
  });
  return [head, ...rows, '', 'Sizes are at the default Text Size: every role multiplies by `--ch-type-k`, so text follows iPhone Text Size.'].join('\n');
}

/** The generated block, without its markers. */
export function renderTokenTables(css) {
  const tokens = readTokens(css);
  const paint = resolve(tokens, '--ch-page-paint', 'light');
  return [
    'Generated from `src/clubhouse/styles/tokens.css` (the light root and the dark root). Ratios are WCAG 2.x, alpha composited, measured against the token named after each ratio (`card-bg` is the ivory card, `workspace` the linen page base). Edit tokens.css, then run `node scripts/clubhouse/design-language.mjs`.',
    '',
    `The page paint, once for every page, pushed screen and page copy: ${code(paint)}.`,
    '',
    '#### Page and surfaces',
    '',
    surfaceTable(tokens),
    '',
    '#### Ink',
    '',
    measuredTable(tokens, INK),
    '',
    '#### Edges',
    '',
    measuredTable(tokens, EDGES),
    '',
    '#### Data marks',
    '',
    measuredTable(tokens, DATA),
    '',
    '#### Keys',
    '',
    measuredTable(tokens, KEYS),
    '',
    '#### The one toggle',
    '',
    valueTable(tokens, TOGGLE),
    '',
    '#### The three elevations',
    '',
    valueTable(tokens, ELEVATION, { expandVars: true }),
    '',
    '#### Radii',
    '',
    radiusTable(tokens),
    '',
    '#### Type roles',
    '',
    typeTable(tokens),
  ].join('\n');
}

/** The doc with its block replaced; throws when the markers are missing. */
export function applyBlock(doc, block) {
  const a = doc.indexOf(START);
  const b = doc.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${DOC} has no ${START} ... ${END} block`);
  return doc.slice(0, a + START.length) + '\n' + block + '\n' + doc.slice(b);
}

/** clubhouse:check: the doc's generated block matches tokens.css. */
export function checkDesignLanguage(root) {
  const docPath = join(root, DOC);
  if (!existsSync(docPath)) return [`${DOC} is missing: it is the Clubhouse design system`];
  const doc = readFileSync(docPath, 'utf8');
  try {
    const next = applyBlock(doc, renderTokenTables(readFileSync(join(root, TOKENS), 'utf8')));
    return next === doc ? [] : [`${DOC}: the token tables are stale; run node scripts/clubhouse/design-language.mjs`];
  } catch (error) {
    return [error.message];
  }
}

function main() {
  const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');
  if (process.argv.includes('--check')) {
    const v = checkDesignLanguage(root);
    if (v.length) {
      for (const x of v) console.error(x);
      process.exit(1);
    }
    console.log(`${DOC}: token tables match ${TOKENS}`);
    return;
  }
  const docPath = join(root, DOC);
  const doc = readFileSync(docPath, 'utf8');
  const next = applyBlock(doc, renderTokenTables(readFileSync(join(root, TOKENS), 'utf8')));
  if (next !== doc) writeFileSync(docPath, next);
  console.log(next === doc ? `${DOC}: already current` : `${DOC}: token tables rewritten`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
