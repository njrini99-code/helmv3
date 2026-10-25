#!/usr/bin/env node
/**
 * B1's screen-by-screen move onto the type roles (tokens.css `--ch-type-<n>`, `-medium`, `-strong`). The type codemod
 * spec (audit rows 26, 27, 28), one stylesheet at a time:
 *
 * 1. Roles (row 26). Each `font: <400|500|600> <size> [/<leading>] var(--ch-font-sans|serif);` whose size is a step
 *    (11-17, 20, 22, 28, 34), written as `calc(<n> * var(--ch-type-k))` or `<n>px` (a leading as a number, px or a
 *    `calc(<l> * var(--ch-type-k))`), becomes the role of the same size
 *    and weight, so no size or weight changes at the default text size. A px size now follows Dynamic Type with the
 *    rest of the screen. Left as written (named exceptions, counted by the guard in look-feel-pass-css.test.ts):
 *      - sizes off the steps (big figures), 700, italics, the mono face;
 *      - chart, tick, axis, badge, count and keycap text, and a rule with a fixed px `height` or `block-size`: a box
 *        sized to its text at one size would clip it at a larger one;
 *      - lane A's selectors (the sidebar fold), so merges stay hunk-local.
 *    The sign-in pages (auth.css) keep the owner's ported type and are not passed to it.
 * 2. Leading (row 27). Multi-line text (leading over 1.15) takes the role's own leading: wrapped text gets air. A single
 *    line (leading 1.15 or under, or a px leading that close: pills, tabs, figures) keeps one tight leading on the next
 *    line, `line-height: var(--ch-lead-tight)` (1.1), unless the rule sets its own line-height after the font. `--lead`
 *    moves an existing single-line `line-height` (a number up to 1.15) in a rule set on a role onto the same token.
 * 3. Tracking (row 28). `--tracking`: in a rule whose size is a step (a role, or a step-sized `font`/`font-size`), a
 *    negative `letter-spacing` off the role set becomes that step's `var(--ch-track-<n>)`; positive tracking (codes,
 *    initials, file badges) and `inherit` are left. `--track-fill`: a rule set on a step role with no letter-spacing of
 *    its own, on a step whose tracking is not 0 (11, 15-17, 20-22, 28, 34), gains `letter-spacing: var(--ch-track-<n>)`
 *    on the line after its font, so the step's tracking applies wherever the step is set.
 *
 * A dry run by default: it prints each change. `--apply` writes. Lines are replaced or inserted, never reflowed.
 *
 *   node scripts/clubhouse/type-roles.mjs src/clubhouse/styles/settings.css [--lead|--tracking|--track-fill] [--apply]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  options: { apply: { type: 'boolean' }, tracking: { type: 'boolean' }, 'track-fill': { type: 'boolean' }, lead: { type: 'boolean' }, help: { type: 'boolean' } },
  allowPositionals: true,
});
if (values.help || positionals.length === 0) {
  console.log('usage: node scripts/clubhouse/type-roles.mjs <stylesheet.css> [--lead|--tracking|--track-fill] [--apply]');
  process.exit(values.help ? 0 : 1);
}

const STEPS = new Set([11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34]);
const TRACKED = new Set([11, 15, 16, 17, 20, 22, 28, 34]);
const WEIGHT = { 400: '', 500: '-medium', 600: '-strong' };
const decl =
  /^(\s*)font: (400|500|600) (?:calc\((\d+) \* var\(--ch-type-k\)\)|(\d+)px)(?:\s*\/\s*(?:([\d.]+)(px)?|calc\((\d+) \* var\(--ch-type-k\)\)))? var\(--ch-font-(?:sans|serif)\);$/;
/** Text whose box is drawn to its size: charts, ticks, badges, counts, keycaps. */
const FIXED_SEL = /tick|__ax\b|-ax\b|axis|chart|svg|badge|count|kbd|keycap/;
/** Lane A edits these selectors concurrently. */
const LANE_A = /\.ch-sidebar|\.ch-brand__fold/;

const ROLE_TRACK = /^(var\(--ch-track-[a-z0-9-]+\)|0|normal|inherit|0\.01em|-0\.01em|-0\.02em|-0\.03em|-0\.038em)$/;
/** The step a rule's text is set in, from its role or its step-sized font or font-size, or null. */
function stepOf(block) {
  const m =
    /font:\s*var\(--ch-type-(\d+)(?:-medium|-strong)?\)/.exec(block) ??
    /font(?:-size)?:\s*(?:\d{3}\s+)?(?:calc\((\d+) \* var\(--ch-type-k\)\)|(\d+)px)/.exec(block);
  const n = m ? Number(m[1] ?? m[2] ?? m[3]) : NaN;
  return STEPS.has(n) ? n : null;
}

/**
 * Calls `edit(selector, lines)` for each innermost rule and splices back what it returns. A declaration never holds a
 * brace, so the text between a `{` and the next `}` is one rule's body; the selector is the text before its `{`.
 */
function eachRule(src, edit) {
  return src.replace(/([^{}]*)\{([^{}]*)\}/g, (whole, sel, body) => {
    const selector = sel.replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const next = edit(selector, body);
    return next === body ? whole : `${sel}{${next}}`;
  });
}

const mode = values.tracking ? 'tracking' : values['track-fill'] ? 'track-fill' : values.lead ? 'lead' : 'roles';
for (const file of positionals) {
  const src = readFileSync(file, 'utf8');
  let moved = 0;
  let tight = 0;
  let kept = 0;
  const log = (s) => !values.apply && console.log(`${file}: ${s}`);
  const next = eachRule(src, (selector, body) => {
    if (LANE_A.test(selector)) return body;
    if (mode === 'tracking') {
      const step = stepOf(body);
      if (step === null) return body;
      return body.replace(/letter-spacing:\s*([^;]+);/g, (d, v) => {
        // Positive tracking is deliberate (a join code, initials, a file badge): it keeps its value.
        if (ROLE_TRACK.test(v.trim()) || !v.trim().startsWith('-')) return d;
        moved += 1;
        log(`${d}  ->  letter-spacing: var(--ch-track-${step});`);
        return `letter-spacing: var(--ch-track-${step});`;
      });
    }
    if (mode === 'track-fill') {
      const m = /^([ \t]*)font: var\(--ch-type-(\d+)(?:-medium|-strong)?\);$/m.exec(body);
      if (!m || !TRACKED.has(Number(m[2])) || /letter-spacing:/.test(body)) return body;
      moved += 1;
      log(`${selector}: + letter-spacing: var(--ch-track-${m[2]})`);
      return body.replace(m[0], `${m[0]}\n${m[1]}letter-spacing: var(--ch-track-${m[2]});`);
    }
    if (mode === 'lead') {
      if (!/font: var\(--ch-type-\d+(?:-medium|-strong)?\);/.test(body)) return body;
      return body.replace(/line-height: ([\d.]+);/g, (d, v) => {
        if (Number(v) > 1.15) return d;
        moved += 1;
        log(`${selector}: ${d}  ->  line-height: var(--ch-lead-tight);`);
        return 'line-height: var(--ch-lead-tight);';
      });
    }
    const lines = body.split('\n');
    const fixedBox = FIXED_SEL.test(selector) || /(?:^|[\s;])(?:height|block-size):\s*\d+(?:\.\d+)?px/.test(body);
    const out = [];
    lines.forEach((line, i) => {
      const m = decl.exec(line);
      const size = m ? Number(m[3] ?? m[4]) : NaN;
      if (!m || !STEPS.has(size) || (m[4] && fixedBox)) {
        if (m && STEPS.has(size)) kept += 1;
        out.push(line);
        return;
      }
      const [, indent, weight, , , lead, leadPx, leadK] = m;
      const ratio = leadK ? Number(leadK) / size : lead === undefined ? Infinity : leadPx ? Number(lead) / size : Number(lead);
      const role = `${indent}font: var(--ch-type-${size}${WEIGHT[weight]});`;
      out.push(role);
      moved += 1;
      // A later line-height in the same rule wins over the shorthand's, so it needs no stand-in.
      const ownLead = lines.slice(i + 1).some((l) => /^\s*line-height:/.test(l));
      const single = ratio <= 1.15 && !ownLead;
      if (single) {
        out.push(`${indent}line-height: var(--ch-lead-tight);`);
        tight += 1;
      }
      log(`${line.trim()}  ->  ${role.trim()}${single ? ' + line-height: var(--ch-lead-tight)' : ''}`);
    });
    return out.join('\n');
  });
  const what =
    mode === 'roles'
      ? `${moved} onto roles (${tight} single-line on --ch-lead-tight; ${kept} step-sized px kept: fixed box or chart text)`
      : mode === 'lead'
        ? `${moved} single-line line-heights onto --ch-lead-tight`
        : `${moved} letter-spacing ${mode === 'tracking' ? 'onto' : 'added from'} the step's tracking`;
  console.log(`${file}: ${what}${values.apply ? '' : ' (dry run; pass --apply)'}`);
  if (values.apply && next !== src) writeFileSync(file, next);
}
