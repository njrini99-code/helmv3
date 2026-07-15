'use client';

/**
 * BaseballMarketingMotionScope — the LazyMotion provider for the public
 * `/baseball` marketing page.
 *
 * The page itself (`src/app/baseball/page.tsx`) is a Server Component (it
 * awaits `getSessionProfile()` and redirects signed-in visitors before ever
 * rendering markup), so it cannot itself carry `'use client'`. But the
 * Living Annual kit's animated atoms (`RuledStatLine`, `Masthead`,
 * `HairlineRule`, `Reveal`, …) are `m`-based framer-motion components that
 * only mount their AnimationFeature — and therefore only ever transition
 * from their `initial` variant to `animate` — when a `<LazyMotion>` ancestor
 * has loaded a feature bundle (verified against framer-motion's
 * `VisualElement.updateFeatures`: a feature only instantiates when
 * `featureDefinitions[key].Feature` is populated, which only `loadFeatures`/
 * `<LazyMotion features>` does). Without it every one of those atoms is
 * frozen at `inkSettles`'s hidden state — `opacity: 0` — forever, not a
 * static-but-visible fallback.
 *
 * This is a deliberately tiny client boundary (the same "self-contained
 * motion provider" shape as `(dashboard)/dashboard/template.tsx` and
 * `BaseballAuthShell`) so the page above it keeps doing its data/redirect
 * work as a genuine Server Component; only this leaf wrapper — and the
 * Living Annual atoms it wraps — hydrate on the client. Server-rendered
 * children are passed in as the `children` prop from the page, exactly as
 * Next.js's "Server Components as children of a Client Component" pattern
 * expects.
 */
import type { ReactNode } from 'react';
import { LazyMotion } from 'framer-motion';
import { loadFeatures } from '@/lib/motion/load-features';

export function BaseballMarketingMotionScope({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
