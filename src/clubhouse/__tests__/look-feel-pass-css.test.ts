import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { hits, ratchet, ROOT, walk } from './_scan';

/**
 * The look-and-feel pass (2026-10-22, mot-04 to mot-07): the rules only a stylesheet can hold. Placeholder text reads
 * on one token in both themes, the weights stay on the scale's rungs, and the phone player's name wraps rather than
 * losing its surname to an ellipsis.
 */
const dir = join(process.cwd(), 'src/clubhouse/styles');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const tokens = read('tokens.css');

describe('placeholder text', () => {
  it('has its own token in the light and the dark theme', () => {
    const dark = tokens.indexOf("html[data-fw-theme='dark'] [data-ui='clubhouse'] {");
    expect(dark).toBeGreaterThan(-1);
    expect(tokens.slice(0, dark)).toMatch(/--ch-text-placeholder:\s*#[0-9a-f]{6};/i);
    expect(tokens.slice(dark)).toMatch(/--ch-text-placeholder:\s*#[0-9a-f]{6};/i);
  });

  it('never sits on a faint ink: every placeholder reads at the placeholder token or darker', () => {
    const readable = ['--ch-text-placeholder', '--ch-text-tertiary', '--ch-ink-500'];
    const faint: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      for (const b of read(f).split('}').filter((x) => /::placeholder[^{]*\{/.test(x))) {
        const color = /(?:^|[\s;{])color:\s*([^;]+);/.exec(b)?.[1];
        if (color && !readable.some((t) => color === `var(${t})`)) faint.push(`${f}: ${color}`);
      }
    }
    expect(faint).toEqual([]);
  });
});

describe('weights', () => {
  it('stay on 400, 500, 600 and 700 outside the sign-in pages', () => {
    const off: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css') && x !== 'auth.css')) {
      for (const m of read(f).matchAll(/font(?:-weight)?:\s*(\d{3})\b/g)) {
        if (!['100', '200', '300', '400', '500', '600', '700', '800', '900'].includes(m[1] ?? '')) off.push(`${f}: ${m[0]}`);
      }
    }
    expect(off).toEqual([]);
  });
});

describe('the type scale (mot-08, owner-approved 2026-10-23)', () => {
  it('every text size up to 36px sits on one of the 11 steps', () => {
    const steps = [11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34];
    const size = String.raw`(?:calc\(\s*([\d.]+)\s*\*\s*var\(--ch-type-k\)\s*\)|([\d.]+)px)`;
    const decl = new RegExp(String.raw`(?:font-size:\s*|(?:^|[;{\s])(?:font|--ch-type-[a-z0-9-]+):\s*(?:(?:italic|normal|\d{3})\s+)*)` + size, 'gm');
    const off: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
      for (const m of read(f).matchAll(decl)) {
        const n = parseFloat(m[1] ?? m[2] ?? '');
        if (n > 0 && n <= 36 && !steps.includes(n)) off.push(`${f}: ${m[0].trim()}`);
      }
    }
    expect(off).toEqual([]);
  });
});

describe('the phone player name', () => {
  it('wraps to two balanced lines instead of an ellipsis', () => {
    const stats = read('stats.css');
    const at = stats.indexOf('  .ch-spm-head h1 {');
    const body = stats.slice(at, stats.indexOf('}', at));
    expect(body).toMatch(/-webkit-line-clamp:\s*2/);
    expect(body).toMatch(/text-wrap:\s*balance/);
    expect(body).not.toMatch(/white-space:\s*nowrap/);
    expect(body).not.toMatch(/text-overflow:\s*ellipsis/);
  });
});

/**
 * B1: type roles. Every size step has a role (`--ch-type-<n>`, `-strong`, `--ch-track-<n>`) in tokens.css; a rule is
 * moved onto them screen by screen, with before and after screenshots. Until then the raw `font:` shorthands and the
 * off-role tracking are counted per file and may only fall: a file brought onto the roles leaves the list.
 */
describe('type roles (B1)', () => {
  const css = walk(join(ROOT, 'styles'), /\.css$/);
  const role = /^font:\s*var\(--ch-type-(?!k\))[a-z0-9-]+\);$/;
  const trackOk = /^letter-spacing:\s*(var\(--ch-track-[a-z0-9-]+\)|0|normal|0\.01em|-0\.01em|-0\.02em|-0\.03em|-0\.038em);$/;

  it('every step has a regular role, a strong one and a tracking', () => {
    for (const n of [11, 12, 13, 14, 15, 16, 17, 20, 22, 28, 34]) {
      expect(tokens).toMatch(new RegExp(`--ch-type-${n}: 400 calc\\(${n} \\* var\\(--ch-type-k\\)\\)/calc\\(\\d+ \\* var\\(--ch-type-k\\)\\)`));
      expect(tokens).toMatch(new RegExp(`--ch-type-${n}-strong: 600 calc\\(${n} \\*`));
      expect(tokens).toMatch(new RegExp(`--ch-track-${n}: -?[\\d.]+(em)?;`));
    }
  });

  it('raw font shorthands only fall, file by file', () => {
    const found = hits(/(?:^|[\s;{])font:\s*[^;]+;/, css).filter((h) => !role.test(h.text.replace(/^.*?(font:)/, '$1')));
    const { over, stale } = ratchet(found, RAW_FONT);
    expect(over).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('letter-spacing is a role value, or a counted holdout that only falls', () => {
    const found = hits(/letter-spacing:\s*[^;]+;/, css).filter((h) => !trackOk.test(h.text.replace(/^.*?(letter-spacing:)/, '$1')));
    const { over, stale } = ratchet(found, OFF_TRACK);
    expect(over).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('two widths only, 88 for dense numbers and 96 for display (the sign-in pages keep theirs)', () => {
    const off = hits(/'wdth'\s*\d+/, css).filter((h) => h.file !== 'styles/auth.css' && !/'wdth' (88|96)\b/.test(h.text));
    expect(off).toEqual([]);
  });

  it('the bar title is one role, pushed or at a tab’s root, and the shell’s stand-in matches it', () => {
    const shell = read('shell.css');
    const rule = (sel: string) => shell.slice(shell.indexOf(sel), shell.indexOf('}', shell.indexOf(sel)));
    expect(tokens).toMatch(/--ch-type-bar-title: var\(--ch-type-17-strong\);/);
    expect(rule('  .ch-pbar__title {')).toMatch(/font: var\(--ch-type-bar-title\);/);
    expect(rule('  .ch-pbar__title.is-start {')).not.toMatch(/font(-size)?:|letter-spacing:/);
    expect(rule('  .ch-topbar__ptitle {')).toMatch(/font: var\(--ch-type-bar-title\);/);
  });

  it('every desktop hero is 52 (Rounds was 50)', () => {
    expect(tokens).toMatch(/--ch-type-hero: 400 calc\(52 \* var\(--ch-type-k\)\)/);
    for (const [f, sel] of [['shell.css', '.ch-hero__title {'], ['qualifiers.css', '.ch-qf-head h1 {'], ['rounds.css', '.ch-rd-h h2 {'], ['classes.css', '.ch-cl-h h1 {']] as const) {
      const src = read(f);
      expect(src.slice(src.indexOf(sel), src.indexOf('}', src.indexOf(sel))), f).toMatch(/font: var\(--ch-type-hero\);/);
    }
  });
});

/** Raw `font:` shorthands per stylesheet on 2026-10-23, before the screen-by-screen move onto the roles. Only falls. */
const RAW_FONT: Record<string, number> = {
  'styles/auth.css': 32,
  'styles/base.css': 1,
  'styles/calendar.css': 61,
  'styles/classes.css': 88,
  'styles/coachhelm-ask.css': 27,
  'styles/coachhelm-brief.css': 11,
  'styles/coachhelm-dive.css': 51,
  'styles/coachhelm-patterns.css': 5,
  'styles/coachhelm-profile.css': 24,
  'styles/coachhelm-standing.css': 24,
  'styles/coachhelm-thread.css': 55,
  'styles/coachhelm-track.css': 9,
  'styles/coachhelm-views.css': 7,
  'styles/coachhelm.css': 69,
  'styles/command.css': 4,
  'styles/component-playground.css': 7,
  'styles/controls.css': 16,
  'styles/goals.css': 5,
  'styles/hero-tones.css': 5,
  'styles/home.css': 117,
  'styles/hub.css': 131,
  'styles/messages.css': 64,
  'styles/onboard.css': 60,
  'styles/qualifiers.css': 94,
  'styles/recruiting.css': 62,
  'styles/roster.css': 76,
  'styles/rounds-recover.css': 8,
  'styles/rounds-setup.css': 66,
  'styles/rounds-track.css': 101,
  'styles/rounds.css': 153,
  'styles/settings.css': 70,
  'styles/shell.css': 56,
  'styles/stats.css': 201,
  'styles/ui.css': 38,
};

/** Off-role `letter-spacing` values per stylesheet on 2026-10-23. Only falls. */
const OFF_TRACK: Record<string, number> = {
  'styles/auth.css': 7,
  'styles/base.css': 2,
  'styles/calendar.css': 7,
  'styles/classes.css': 6,
  'styles/coachhelm-ask.css': 3,
  'styles/coachhelm-dive.css': 5,
  'styles/coachhelm-patterns.css': 1,
  'styles/coachhelm-profile.css': 1,
  'styles/coachhelm-standing.css': 2,
  'styles/coachhelm-views.css': 1,
  'styles/coachhelm.css': 3,
  'styles/controls.css': 2,
  'styles/hero-tones.css': 1,
  'styles/home.css': 18,
  'styles/hub.css': 14,
  'styles/messages.css': 9,
  'styles/onboard.css': 9,
  'styles/qualifiers.css': 9,
  'styles/recruiting.css': 5,
  'styles/roster.css': 11,
  'styles/rounds-recover.css': 1,
  'styles/rounds-setup.css': 8,
  'styles/rounds-track.css': 5,
  'styles/rounds.css': 25,
  'styles/settings.css': 9,
  'styles/shell.css': 10,
  'styles/stats.css': 23,
  'styles/ui.css': 11,
};
