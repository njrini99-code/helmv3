/**
 * The Privacy / Terms links at the foot of the public auth cards are touch
 * targets on the phones these pages are mostly used from.
 *
 * Measured in production 2026-08-17 on `/golf/login`: `Privacy` renders 41x16
 * and `Terms` 33x16. Neither carries any responsive sizing, so those are the
 * dimensions on a phone too. That is under the project's own documented 44px
 * standard (`docs/UIUX_AUDIT.md`, applied at 55 sites across
 * `components/fairway` and `admin/crm`) and under WCAG 2.2's 24px AA minimum
 * for Target Size.
 *
 * THE REFERENCE IMPLEMENTATION IS ALREADY IN THIS REPO. `signup/page.tsx`
 * renders the same two links as:
 *
 *     px-3 py-3 -my-3 min-h-[44px] flex items-center rounded-lg
 *
 * — a 44px hit area, with `-my-3` cancelling the vertical growth so the visual
 * layout is unchanged. The signup gate had it; its two sibling auth pages did
 * not. This test is what keeps the three in step.
 *
 * Asserted statically because the height is a CSS-computed value: jsdom returns
 * 0 for every `getBoundingClientRect`, so a render test would pass while the
 * real target stayed 16px tall — the instrument would be unable to see the bug.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Public surfaces that render the Privacy / Terms pair.
 *
 * `landing/Footer.tsx` is the shared marketing footer — it appears on the
 * landing page, pricing, products, about, support and the BaseballHelm page, so
 * it is the highest-reach instance of the three. Measured live on `/baseball`
 * 2026-08-17: `Privacy` 39x18, `Terms` 32x18.
 */
const AUTH_PAGES = [
  'src/app/golf/(auth)/login/page.tsx',
  'src/app/golf/(auth)/signup/page.tsx',
  'src/app/golf/(auth)/demo/page.tsx',
  'src/components/landing/Footer.tsx',
];

/** The 44px hit-area marker, matching the signup gate's implementation. */
const HIT_AREA = 'min-h-[44px]';

/** The `<Link href="/privacy" … >` opening tag, however it is wrapped. */
function privacyLinkTag(src: string): string | null {
  const at = src.indexOf('href="/privacy"');
  if (at === -1) return null;
  const open = src.lastIndexOf('<', at);
  const close = src.indexOf('>', at);
  return open === -1 || close === -1 ? null : src.slice(open, close + 1);
}

describe('legal link touch targets', () => {
  it('finds all three auth pages (guards the fixture)', () => {
    for (const p of AUTH_PAGES) {
      expect(existsSync(join(process.cwd(), p)), p).toBe(true);
    }
  });

  it.each(AUTH_PAGES)('gives %s a 44px legal-link hit area', (page) => {
    const src = readFileSync(join(process.cwd(), page), 'utf8');
    const tag = privacyLinkTag(src);

    expect(tag, `no href="/privacy" link found in ${page}`).not.toBeNull();
    expect(
      tag,
      `the Privacy link in ${page} needs ${HIT_AREA} (see signup/page.tsx for the `
        + `px-3 py-3 -my-3 pattern that expands the target without moving layout)`,
    ).toContain(HIT_AREA);
  });
});
