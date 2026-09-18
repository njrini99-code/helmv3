# A00 verification — A03-003 (alpha-opacity shorthand over color-mix token vars)

**Verdict: REFUTED. The `/NN` alpha shorthand compiles correctly. No focus ring or invalid-state
border is invisible for this reason.**

A03 filed A03-003 as P1 `BLOCKED/NOT_RUN` — 133+ form-primitive sites rely on `/NN` alpha shorthand
over `color-mix()`-wrapped CSS variables, with contradictory in-repo evidence: a comment in
`segmented.tsx` claiming it silently compiles to nothing, versus `tailwind.config.ts`'s `tokenColor()`
docblock claiming it is fixed. A03 could not compile in a read-only audit and correctly flagged it as
the top must-compile gate rather than guessing.

A00 compiled it. The config's helper is:

    const tokenColor = (cssVar: string) =>
      `color-mix(in oklab, var(${cssVar}) calc(<alpha-value> * 100%), transparent)`;
    // tailwind.config.ts:37-38

Tailwind substitutes `<alpha-value>` with the modifier, so the shorthand resolves.

## Command (read-only; wrote only into the session scratchpad)

    ./node_modules/.bin/tailwindcss -c <scratch>/tw.ts -i <scratch>/probe.css -o <scratch>/out3.css

where `tw.ts` spreads the repo config and overrides `content` to point at a probe file containing
`bg-surface bg-surface/50 ring-accent-500/40 border-accent-600/30 text-text-primary/70
bg-accent-500/10 ring-offset-canvas`. Exit 0, 7 of 7 utilities emitted.

## Emitted rules (verbatim)

    .bg-surface\/50        { background-color: color-mix(in oklab, var(--fw-color-surface) calc(0.5 * 100%), transparent) }
    .ring-accent-500\/40   { --tw-ring-color:  color-mix(in oklab, var(--fw-color-accent-500) calc(0.4 * 100%), transparent) }
    .border-accent-600\/30 { border-color:     color-mix(in oklab, var(--fw-color-accent-600) calc(0.3 * 100%), transparent) }
    .text-text-primary\/70 { color:            color-mix(in oklab, var(--fw-color-text-primary) calc(0.7 * 100%), transparent) }
    .bg-accent-500\/10     { background-color: color-mix(in oklab, var(--fw-color-accent-500) calc(0.1 * 100%), transparent) }
    .bg-surface            { --tw-bg-opacity: 1; background-color: color-mix(in oklab, var(--fw-color-surface) calc(var(--tw-bg-opacity, 1) * 100%), transparent) }
    .ring-offset-canvas    { --tw-ring-offset-color: color-mix(in oklab, var(--fw-color-canvas) calc(1 * 100%), transparent) }

## Consequences

1. **A03-003 downgrades from P1 BLOCKED to P3 documentation defect.** The remaining real problem is
   that the repo contradicts itself: the `segmented.tsx` comment is stale and should be removed, or
   another agent will "fix" working code on its authority. Route to A03.
2. **Two naming facts worth recording**, both of which cost A00 two failed compiles first: the Fairway
   colour keys are NOT `fw-`-prefixed in the Tailwind namespace (`bg-surface`, not `bg-fw-surface` —
   the `--fw-color-*` prefix is on the CSS variable only), and Tailwind v3's `--content` CLI flag did
   not override the config's `content` array; a config that spreads the repo config and replaces
   `content` did.
3. **What this does NOT prove.** Compilation is not rendering. That a rule is emitted does not
   establish contrast, that the variable is defined in every theme, or that the ring is visible
   against its actual background. `color-mix()` in oklab also needs the browser support floor
   confirming for the supported WebView range. Those remain A03/A12 checks with a browser.
