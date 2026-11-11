import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * CH-13853: what an answer shows is styled. A token pass (6a51a084d) once dropped every rule of the validated visual and it
 * rendered as bare buttons. The visual, the composition and a read's evidence are drawn by the studio now, in the yardage
 * book's look (docs/clubhouse/coachhelm-chat-v3/LOOK.md, direction A; owner 11 Nov), and its stylesheet is
 * coachhelm-ask-studio.css: every class the studio uses has a rule there, a gain is green and a loss amber, nothing is a
 * bar on a track, a pill or a chip, and nothing moves but a live answer's arrival.
 */
const root = join(__dirname, '..');
const css = readFileSync(join(root, 'styles/coachhelm-ask-studio.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const SOURCES = ['studio/components.tsx', 'studio/drawings.tsx', 'studio/ask.tsx', 'studio/registry.tsx', 'visual/CoachComposition.tsx', 'visual/CoachVisualArtifact.tsx', 'Evidence.tsx', 'EvidencePanel.tsx'];
const tsx = SOURCES.map((f) => readFileSync(join(root, 'screens/coachhelm/chat', f), 'utf8')).join('\n');

/** The declarations of the rule whose selector is `sel`, alone or as one of a list. */
const rule = (sel: string) =>
  [...css.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => m[1]!.trim() === sel || m[1]!.split(/,\s*\n/).some((s) => s.trim() === sel))?.[2] ?? '';
const selectors = [...css.matchAll(/([^{}]*)\{/g)].map((m) => m[1]!.trim()).filter((s) => s && !s.startsWith('@') && !/^(?:from|to)$/.test(s));

/** A kind's own root (its rules hang off its parts) and a hook only a screen reader's words carry: named, never styled. */
const NAMES_ONLY = ['ch-aks-rank', 'ch-aks-trend', 'ch-aks-round', 'ch-aks-sg', 'ch-aks-dist', 'ch-aks-sched', 'ch-aks-record', 'ch-aks-table', 'ch-aks-fig__vs'];

describe('CH-13853: what an answer shows is styled', () => {
  it('every ch-aks class the studio uses has a rule in coachhelm-ask-studio.css', () => {
    const used = [...new Set([...tsx.matchAll(/(?<![\w-])ch-aks(?:-[a-z]+)*(?:__[a-z-]+)?\b/g)].map((m) => m[0]))];
    expect(used).toEqual(expect.arrayContaining(['ch-aks', 'ch-aks-sec', 'ch-aks-title', 'ch-aks-hole__stem', 'ch-aks-hole__key', 'ch-aks-ruled__path', 'ch-aks-fig__value', 'ch-aks-rows']));
    const missing = used.filter((c) => !new RegExp(String.raw`\.${c}(?![\w-])[^{}]*\{`).test(css));
    expect(missing.sort()).toEqual([...NAMES_ONLY].sort());
  });

  it('a gain is green and a loss amber, on the stem, its end and its figure; red is the pin’s flag only', () => {
    expect(rule('.ch-aks-hole__part.is-gain .ch-aks-hole__stem')).toMatch(/stroke: var\(--ch-gain\);/);
    expect(rule('.ch-aks-hole__part.is-loss .ch-aks-hole__stem')).toMatch(/stroke: var\(--ch-loss\);/);
    expect(rule('.ch-aks-hole__part.is-gain :is(.ch-aks-hole__end, .ch-aks-hole__value)')).toMatch(/fill: var\(--ch-gain\);/);
    expect(rule('.ch-aks-hole__part.is-loss :is(.ch-aks-hole__end, .ch-aks-hole__value)')).toMatch(/fill: var\(--ch-loss\);/);
    expect(rule(".ch-aks [data-tone='gain']")).toMatch(/color: var\(--ch-gain\);/);
    expect(rule(".ch-aks [data-tone='loss']")).toMatch(/color: var\(--ch-loss\);/);
    expect(rule('.ch-aks-hole__flag')).toMatch(/fill: var\(--ch-chart-flag\);/);
    const red = [...css.matchAll(/([^{}]*)\{([^{}]*var\(--ch-(?:chart-flag|danger|red)[^{}]*)\}/g)].map((m) => m[1]!.trim());
    expect(red).toEqual(['.ch-aks-hole__flag']);
  });

  it('nothing is a bar on a track, a pill or a chip, and nothing is boxed: no fill, no shadow, no frame around a part', () => {
    expect(selectors.filter((s) => /track|pill|chip|badge|card/.test(s))).toEqual([]);
    // The one shadow named is the shared nine's own, turned off where a round lies flat on the paper.
    expect(css).not.toMatch(/box-shadow: (?!none;)|var\(--ch-chart-track\)|var\(--ch-well-bg/);
    expect(css.match(/box-shadow: none;/g) ?? []).toHaveLength(1);
    // The only fills are the table's sticky first column (the paper it sits on) and the best-in-measure dot.
    const filled = [...css.matchAll(/([^{}]*)\{[^{}]*background: (?!none)[^{}]*\}/g)].map((m) => m[1]!.trim());
    expect(filled).toEqual(['.ch-aks-cmp__table th:first-child', '.ch-aks-cmp__dot']);
    // A rule is a hairline on one side, between two things; no rule draws a frame.
    expect(css).not.toMatch(/(?<![-\w])border: (?!0)/);
  });

  it('draws in place: no transition anywhere, and an animation only on a visual that arrived in a live answer', () => {
    expect(css).not.toMatch(/transition/);
    const moving = [...css.matchAll(/([^{}]*)\{[^{}]*animation: (?!none)[^{}]*\}/g)].map((m) => m[1]!.trim());
    expect(moving.length).toBeGreaterThan(0);
    for (const sel of moving) expect(sel).toMatch(/^\.ch-aks-cv\[data-live\] /);
    // Opacity, transform and the line's path length only, each on a duration token.
    const frames = [...css.matchAll(/@keyframes [\w-]+ \{\s*from \{([^{}]*)\}/g)].map((m) => m[1]!.trim());
    expect(frames.sort()).toEqual(['opacity: 0;', 'opacity: 0;\n    transform: translateY(8px);', 'stroke-dashoffset: 1;']);
    for (const m of css.matchAll(/animation: (?!none)([^;]+);/g)) expect(m[1]).toMatch(/var\(--ch-dur-(?:base|reveal|quick)\) var\(--ch-ease\) backwards$/);
    // Reduce Motion and Animations off end every one of them.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?animation: none;/);
    expect(css).toMatch(/\[data-motion='off'\] \.ch-aks-cv\[data-live\] \.ch-aks-cv__in,[\s\S]*?animation: none;/);
  });

  it('a key is a 44px target with the shared focus ring, and a part of the hole is a 44px column over its own stem', () => {
    expect(rule('.ch-aks-ask.is-key')).toMatch(/min-height: 44px;/);
    expect(rule('.ch-aks-ask.is-key:focus-visible')).toMatch(/outline: 2px solid var\(--ch-border-focus\);/);
    expect(rule('.ch-aks-open')).toMatch(/width: 44px;\s*min-height: 44px;/);
    expect(rule('.ch-aks-hole__keys > li')).toMatch(/width: 44px;/);
    expect(rule('.ch-aks-hole__key')).toMatch(/height: 100%;/);
  });

  it('sets type by its role: every font is a --ch-type token, and the one large figure is this sheet’s own role', () => {
    const fonts = [...css.matchAll(/(?<![-\w])font: ([^;]+);/g)].map((m) => m[1]!);
    expect(fonts.length).toBeGreaterThan(20);
    expect(fonts.filter((f) => !/^var\(--ch-type-[a-z0-9-]+\)$/.test(f))).toEqual([]);
    expect(rule('.ch-aks')).toMatch(/--ch-type-aks-figure: 500 calc\(64 \* var\(--ch-type-k\)\) \/ 0\.8 var\(--ch-font-sans\);/);
    expect(rule('.ch-aks-fig[data-one] .ch-aks-fig__value')).toMatch(/font: var\(--ch-type-aks-figure\);/);
  });

  it('uses Clubhouse tokens only: every custom property it reads is a --ch-* one', () => {
    const vars = [...css.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]!);
    expect(vars.length).toBeGreaterThan(0);
    expect(vars.filter((v) => !v.startsWith('--ch-'))).toEqual([]);
  });
});
