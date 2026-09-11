// @vitest-environment jsdom
/**
 * ============================================================================
 * SegmentedLinks × AdminMotionProvider — real framer-motion, no mocks
 * ----------------------------------------------------------------------------
 * `segmented-links.test.tsx` fully replaces `framer-motion` with a
 * deterministic passthrough (necessary for its own assertions), which means
 * it cannot see whether the REAL library actually animates anything. This
 * file exists to answer exactly one question with the unmocked library: does
 * `SegmentedPill`'s `layoutId` glide (a `motion.span`, not an `m.span`) need
 * `AdminMotionProvider` to load framer-motion's `domMax` feature set, or does
 * it work under `domAnimation` (what `AdminMotionProvider` actually loads)?
 *
 * `motion.*` (imported directly from `'framer-motion'`, as `segmented.tsx`
 * does) is NOT the lazy `m.*` family `LazyMotion`/`domAnimation`/`domMax`
 * gate. `render/components/motion/proxy.mjs` builds `motion` via
 * `createMotionProxy(featureBundle, ...)`, where `featureBundle`
 * (`render/components/motion/feature-bundle.mjs`) already statically
 * imports the real `layout` feature. `motion/index.mjs`'s
 * `createMotionComponent` runs `preloadedFeatures && loadFeatures(preloadedFeatures)`
 * — merging that real `layout` implementation into the SAME global feature
 * registry (`motion-dom`'s `getFeatureDefinitions`/`setFeatureDefinitions`)
 * that `m.*` consults — the instant `motion.span` is first accessed, which
 * happens before React ever renders the element. `loadFeatures` merges
 * (`{...existing, ...new}`), so `AdminMotionProvider`'s `domAnimation` (which
 * has no `layout` key at all) can never remove or shadow it, regardless of
 * load order. So the `domAnimation`/`domMax` split is real, but it gates
 * `m.*`, not `SegmentedPill`'s `motion.span` — this test asserts the real
 * registry ends up with a working `layout.MeasureLayout` after
 * `SegmentedLinks` renders under the actual `AdminMotionProvider` used at
 * `/admin/errors`, with nothing about framer-motion mocked out.
 *
 * SCOPE: this proves the `layout` feature is installed and `MeasureLayout`
 * mounts for the active pill — i.e. the glide mechanism is live. It does NOT
 * prove the pill visibly glides across a soft navigation between `?lens=`
 * values (that also needs the `SegmentedLinks` instance, and its
 * `useId`-derived `pillId`, to survive that navigation without remounting —
 * a separate question this file does not cover). jsdom also returns zero
 * layout rects, so no FLIP measurement is observable here either way; the
 * registry-level assertion is the only non-flaky thing to check in this
 * environment.
 * ========================================================================== */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { getFeatureDefinitions } from 'motion-dom';
import { AdminMotionProvider } from '@/components/admin/motion-provider';
import { SegmentedLinks, type SegmentedLinksOption } from '../segmented-links';

type Fruit = 'apple' | 'banana';

const OPTIONS: ReadonlyArray<SegmentedLinksOption<Fruit>> = [
  { value: 'apple', label: 'Apple', href: '/fruit?v=apple', count: 4 },
  { value: 'banana', label: 'Banana', href: '/fruit?v=banana', count: 0 },
];

describe('SegmentedLinks under the real AdminMotionProvider (unmocked framer-motion)', () => {
  it('installs a real layout.MeasureLayout in the global feature registry even though AdminMotionProvider only loads domAnimation-equivalent features', () => {
    render(
      <AdminMotionProvider>
        <SegmentedLinks options={OPTIONS} value="apple" ariaLabel="Fruit view" />
      </AdminMotionProvider>,
    );

    // If the reported defect were correct — that the active pill's
    // `layoutId` glide is dead because AdminMotionProvider never loads
    // `domMax` — this would be `undefined`. It is not: `motion.span`
    // (SegmentedPill's implementation) preloads the real `layout` feature
    // itself, independent of whichever LazyMotion feature set an ancestor
    // loaded.
    const layoutFeature = getFeatureDefinitions().layout;
    expect(layoutFeature).toBeDefined();
    expect(layoutFeature?.MeasureLayout).toBeDefined();
  });
});
