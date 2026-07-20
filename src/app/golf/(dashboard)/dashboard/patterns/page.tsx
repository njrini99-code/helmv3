import { permanentRedirect } from 'next/navigation';

/**
 * `/golf/dashboard/patterns` — LEGACY, permanently redirected (2026-07-19,
 * plan Task 9). Patterns is now the `patterns` filter of the consolidated
 * Signals drill on the coach Intelligence home (spec §5.4) — the stage IS
 * the nav. `surface-registry.ts`'s `patterns` entry is
 * `legacy: true, hidden: true` and points its canonical href here-onward.
 */
export default function PatternsRedirect(): never {
  permanentRedirect('/golf/dashboard/intelligence?view=signals&filter=patterns');
}
