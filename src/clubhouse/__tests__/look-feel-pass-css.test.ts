import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { code, hits, ratchet, ROOT, walk, type Hit } from './_scan';

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
    const found = hits(/(?:^|[\s;{])font:\s*[^;]+;/, css).filter((h) => !role.test(/font:\s*[^;]+;/.exec(h.text)![0]));
    const { over, stale } = ratchet(found, RAW_FONT);
    expect(over).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('letter-spacing is a role value, or a counted holdout that only falls', () => {
    const found = hits(/letter-spacing:\s*[^;]+;/, css).filter((h) => !trackOk.test(/letter-spacing:\s*[^;]+;/.exec(h.text)![0]));
    const { over, stale } = ratchet(found, OFF_TRACK);
    expect(over).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('two widths only, 88 for dense numbers and 96 for display, the sign-in pages too, and font-stretch as well', () => {
    const off = [
      ...hits(/'wdth'\s*\d+/, css).filter((h) => !/'wdth' (88|96)\b/.test(h.text)),
      ...hits(/font-stretch:/, css).filter((h) => !/font-stretch:\s*(88|96)%;/.test(h.text)),
    ];
    expect(off).toEqual([]);
  });

  /**
   * The shorthand count can't be dodged by spelling a size or a weight as a longhand: a raw `font-size` or `font-weight`
   * (anything but inherit, initial, unset or a token) is counted per file too, and may only fall.
   */
  it('raw font-size and font-weight longhands only fall, file by file', () => {
    const found: Hit[] = [];
    for (const f of css) {
      for (const m of code(f).matchAll(/(?:^|[\s;{])(font-(?:size|weight):\s*(?!inherit|initial|unset|var\()[^;}]+);/g)) {
        found.push({ file: relative(ROOT, f), line: 0, text: m[1]! });
      }
    }
    const { over, stale } = ratchet(found, RAW_LONGHAND);
    expect(over).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('the bar title is one role, pushed or at a tab’s root, and the shell’s stand-in matches it', () => {
    const shell = read('shell.css');
    const rule = (sel: string) => shell.slice(shell.indexOf(sel), shell.indexOf('}', shell.indexOf(sel)));
    expect(tokens).toMatch(/--ch-type-bar-title: 600 calc\(17 \* var\(--ch-type-k\)\)\/calc\(22 \* var\(--ch-type-k\)\)/);
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

/** Raw `font:` shorthands per stylesheet left after the codemod (2026-10-23): pixel sizes, sizes off the steps, 700 and the sign-in pages. Only falls. */
const RAW_FONT: Record<string, number> = {
  'styles/auth.css': 32,
  'styles/base.css': 1,
  'styles/calendar.css': 27,
  'styles/classes.css': 38,
  'styles/coachhelm-ask.css': 2,
  'styles/coachhelm-dive.css': 7,
  'styles/coachhelm-profile.css': 3,
  'styles/coachhelm-standing.css': 2,
  'styles/coachhelm-thread.css': 10,
  'styles/coachhelm.css': 11,
  'styles/controls.css': 3,
  'styles/goals.css': 5,
  'styles/hero-tones.css': 5,
  'styles/home.css': 52,
  'styles/hub.css': 19,
  'styles/messages.css': 4,
  'styles/onboard.css': 60,
  'styles/qualifiers.css': 38,
  'styles/recruiting.css': 17,
  'styles/roster.css': 47,
  'styles/rounds-setup.css': 14,
  'styles/rounds-track.css': 36,
  'styles/rounds.css': 74,
  'styles/settings.css': 3,
  'styles/shell.css': 27,
  'styles/stats.css': 148,
  'styles/ui.css': 10,
};

/** Raw `font-size` and `font-weight` longhands per stylesheet on 2026-10-24 (B1). Only falls. */
const RAW_LONGHAND: Record<string, number> = {
  'styles/auth.css': 22,
  'styles/base.css': 3,
  'styles/calendar.css': 20,
  'styles/classes.css': 14,
  'styles/coachhelm-ask.css': 9,
  'styles/coachhelm-brief.css': 3,
  'styles/coachhelm-dive.css': 11,
  'styles/coachhelm-profile.css': 8,
  'styles/coachhelm-standing.css': 15,
  'styles/coachhelm-thread.css': 20,
  'styles/coachhelm-track.css': 2,
  'styles/coachhelm-views.css': 2,
  'styles/coachhelm.css': 19,
  'styles/command.css': 2,
  'styles/controls.css': 18,
  'styles/hero-tones.css': 2,
  'styles/home.css': 47,
  'styles/hub.css': 47,
  'styles/messages.css': 12,
  'styles/onboard.css': 23,
  'styles/qualifiers.css': 52,
  'styles/recruiting.css': 18,
  'styles/roster.css': 8,
  'styles/rounds-recover.css': 2,
  'styles/rounds-setup.css': 15,
  'styles/rounds-track.css': 27,
  'styles/rounds.css': 71,
  'styles/settings.css': 6,
  'styles/shell.css': 22,
  'styles/stats.css': 55,
  'styles/ui.css': 22,
};

/** Off-role `letter-spacing` left after the tracking pass (2026-10-23): positive tracking on codes, initials and badges, large figures off the steps, and the sign-in pages. Only falls. */
const OFF_TRACK: Record<string, number> = {
  'styles/auth.css': 7,
  'styles/base.css': 2,
  'styles/classes.css': 1,
  'styles/coachhelm-ask.css': 1,
  'styles/coachhelm-dive.css': 2,
  'styles/coachhelm-patterns.css': 1,
  'styles/coachhelm-standing.css': 1,
  'styles/coachhelm.css': 2,
  'styles/hero-tones.css': 1,
  'styles/home.css': 11,
  'styles/hub.css': 8,
  'styles/onboard.css': 4,
  'styles/qualifiers.css': 2,
  'styles/roster.css': 2,
  'styles/rounds-track.css': 4,
  'styles/rounds.css': 7,
  'styles/settings.css': 1,
  'styles/shell.css': 5,
  'styles/stats.css': 9,
  'styles/ui.css': 5,
};

describe('eyebrows (CONS-30)', () => {
  it('every eyebrow and kicker is the one role, 13/500 with no tracking, or sets no type at all', () => {
    expect(tokens).toMatch(/--ch-type-eyebrow: 500 calc\(13 \* var\(--ch-type-k\)\)/);
    const off: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.css') && x !== 'auth.css')) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      for (const [, sel, body] of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
        if (!/eyebrow|kicker/.test(sel!)) continue;
        for (const d of body!.match(/(?:font|font-size|letter-spacing):\s*[^;]+;/g) ?? []) {
          if (d !== 'font: var(--ch-type-eyebrow);' && d !== 'letter-spacing: var(--ch-track-eyebrow);') off.push(`${f} ${sel!.trim()}: ${d}`);
        }
      }
    }
    expect(off).toEqual([]);
  });
});

/**
 * CONS-39: tabular figures come from `.ch-num` (ui.css) or a primitive (ui.css, controls.css), not a local
 * `font-variant-numeric` in every screen's stylesheet. The `font` shorthand can't carry it, so each one moves with its
 * element; until then they are counted per file and may only fall.
 */
describe('tabular figures (CONS-39)', () => {
  it('local font-variant-numeric outside the primitives only falls', () => {
    const css = walk(join(ROOT, 'styles'), /\.css$/).filter((f) => !/styles\/(ui|controls|tokens)\.css$/.test(f));
    const { over, stale } = ratchet(hits(/font-variant-numeric:/, css), LOCAL_TABULAR);
    expect(over).toEqual([]);
    expect(stale).toEqual([]);
  });
});

/** Local `font-variant-numeric` per stylesheet on 2026-10-23. Only falls. */
const LOCAL_TABULAR: Record<string, number> = {
  'styles/auth.css': 1,
  'styles/base.css': 2,
  'styles/calendar.css': 29,
  'styles/classes.css': 22,
  'styles/coachhelm-profile.css': 5,
  'styles/coachhelm-thread.css': 9,
  'styles/coachhelm.css': 4,
  'styles/home.css': 61,
  'styles/hub.css': 31,
  'styles/messages.css': 15,
  'styles/onboard.css': 8,
  'styles/qualifiers.css': 54,
  'styles/recruiting.css': 9,
  'styles/roster.css': 26,
  'styles/rounds-recover.css': 1,
  'styles/rounds-setup.css': 15,
  'styles/rounds-track.css': 35,
  'styles/rounds.css': 62,
  'styles/settings.css': 9,
  'styles/shell.css': 5,
  'styles/stats.css': 99,
};
