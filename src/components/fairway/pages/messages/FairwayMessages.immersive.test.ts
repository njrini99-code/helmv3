/**
 * ============================================================================
 * An immersive surface hides EVERY band of shell chrome below `md`
 * ----------------------------------------------------------------------------
 * `useImmersiveSurface(mobileShowChat)` (FairwayMessages.tsx) sets
 * `data-fw-immersive` on <body>, and `globals.css` is what actually hides the
 * chrome. The rule covered the bottom tab bar and the shell top bar — but not
 * `FairwayHubSubNav`, the Messages/Announcements strip the shell renders for
 * every golf hub.
 *
 * Measured in a real browser at 390x844 with a conversation open: the strip
 * stayed (39px + border, `position: sticky`) while the surface underneath sized
 * itself against the FULL viewport, because it believes an immersive surface
 * owns the screen. The thread's own header laid out under the strip and was
 * clipped — at scrollTop 0 the contact-name row measured 0px tall and only the
 * tail of the subtitle bled out from beneath. BACK was unreachable on every
 * conversation on a phone.
 *
 * This reads the CSS as text on purpose. jsdom applies no stylesheet, so a
 * render test cannot see the rule at all; the only honest assertion available
 * here is that the declaration exists, is inside the phone-only media block,
 * and is keyed on the immersive attribute rather than applying unconditionally
 * — which would delete the sub-nav from every golf hub.
 * ========================================================================== */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** The `@media (max-width: 767px)` block that carries the immersive top-bar rule. */
function phoneImmersiveBlock(): string {
  const anchor = css.indexOf("body[data-fw-immersive] [data-slot='fw-topbar']");
  expect(anchor, 'the immersive top-bar rule must still exist to anchor this').toBeGreaterThan(-1);

  // Walk back to the opening of the @media block this rule lives in.
  const mediaStart = css.lastIndexOf('@media (max-width: 767px)', anchor);
  expect(mediaStart).toBeGreaterThan(-1);

  // Walk forward, balancing braces, to that block's close.
  let depth = 0;
  let i = css.indexOf('{', mediaStart);
  const from = i;
  for (; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return css.slice(from, i + 1);
}

describe('immersive surface — the hub sub-nav goes with the top bar', () => {
  it('hides the hub sub-nav while a surface is immersive', () => {
    expect(css).toContain("body[data-fw-immersive] [data-slot='fairway-hub-subnav']");
  });

  it('targets the slot FairwayHubSubNav actually renders', () => {
    const nav = readFileSync(
      join(process.cwd(), 'src/components/fairway/app-shell/FairwayHubSubNav.tsx'),
      'utf8',
    );
    // If the component's slot is ever renamed, the CSS rule silently stops
    // matching and Back is buried again with nothing failing. This is the pin.
    expect(nav).toContain('fairway-hub-subnav');
  });

  it('scopes the rule to phones, beside the top-bar rule it extends', () => {
    const block = phoneImmersiveBlock();
    expect(block).toContain("[data-slot='fw-topbar']");
    expect(block).toContain("[data-slot='fairway-hub-subnav']");
  });

  it('never hides the sub-nav unconditionally — only under the immersive attribute', () => {
    // Every occurrence of the slot in a selector position must carry the
    // attribute guard; a bare `[data-slot='fairway-hub-subnav'] { display: none }`
    // would delete the strip from every golf hub on every route.
    const occurrences = css.split("[data-slot='fairway-hub-subnav']").slice(0, -1);
    expect(occurrences.length).toBeGreaterThan(0);
    for (const before of occurrences) {
      expect(before.endsWith('body[data-fw-immersive] ')).toBe(true);
    }
  });

  it('is the messages surface that claims immersion, and only while a thread is open', () => {
    const page = readFileSync(
      join(process.cwd(), 'src/components/fairway/pages/messages/FairwayMessages.tsx'),
      'utf8',
    );
    expect(page).toContain('useImmersiveSurface(mobileShowChat)');
  });
});
