import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Clubhouse doctrine: sentence case and no tracked text. The final design review (2026-10-08) found engraved eyebrows
 * at 0.12em and 0.14em on Qualifiers, CoachHelm and Messages; they take PageIntro's eyebrow tracking instead.
 */
const read = (f: string) => readFileSync(join(process.cwd(), 'src/clubhouse/styles', f), 'utf8');
/** Engraved tracking, a tenth of an em or more (a hair of optical spacing, such as 0.02em on a chip, is not tracking). */
const TRACKED = /letter-spacing:\s*0?\.[1-9]\d*em/;

describe('eyebrows are not tracked (final design review, 2026-10-08)', () => {
  it("PageIntro's eyebrow is the reference: 0.01em", () => {
    expect(read('ui.css')).toMatch(/\.ch-intro__eyebrow\s*{[^}]*letter-spacing: 0\.01em;/);
  });

  it.each(['qualifiers.css', 'coachhelm.css', 'messages.css'])('%s draws no tracked text', (file) => {
    expect(read(file)).not.toMatch(TRACKED);
  });

  it('each fixed eyebrow keeps its size and weight and takes the reference tracking', () => {
    const q = read('qualifiers.css');
    expect(q).toMatch(/\.ch-qf--list \.ch-qf-eyebrow\s*{\s*font: 500 12px\/1\.2 var\(--ch-font-sans\);\s*letter-spacing: 0\.01em;/);
    expect(q).toMatch(/\.ch-qfm-head__k > \.ch-num\s*{\s*font: 500 12px\/1\.2 var\(--ch-font-sans\);\s*letter-spacing: 0\.01em;/);
    expect(q).toMatch(/\.ch-qfs \.ch-qf-eyebrow\s*{\s*font: 500 12px\/1\.2 var\(--ch-font-sans\);\s*letter-spacing: 0\.01em;/);
    expect(q).toMatch(/\.ch-qf\[data-canopy\] \.ch-qf-eyebrow\s*{[^}]*font: 500 11px\/1\.3 var\(--ch-font-sans\);\s*letter-spacing: 0\.01em;/);
    expect(read('coachhelm.css')).toMatch(/\.ch-hl\.is-phone \.ch-hl-role\s*{\s*font: 500 12px\/1\.2 var\(--ch-font-sans\);\s*letter-spacing: 0\.01em;/);
    expect(read('messages.css')).toMatch(/\.ch-msp \.ch-ms-sec\.is-date > \.ch-ms-sec__l\s*{[^}]*font: 500 12px\/1\.2 var\(--ch-font-sans\);\s*letter-spacing: 0\.01em;/);
  });
});
