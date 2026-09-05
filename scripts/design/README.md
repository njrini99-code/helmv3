# scripts/design — look at the real components

A design review that is not looking at the shipped component is reviewing a
drawing of it. These two scripts turn a live `npm run dev` route into a PNG
you can actually read, using the app's own compiled CSS and its own tokens.

```bash
npm run dev                                   # must be reachable — curl it, the log lies
node scripts/design/snapshot-route.mjs "/fairway-preview/rounds?screen=setup" /tmp/setup.html 390
bash scripts/design/tile-phone.sh /tmp/setup.html /tmp/out setup 2 4
```

`snapshot-route.mjs <route> <out.html> [widthPx]` writes one self-contained
HTML file: the route's markup with every stylesheet, font and image inlined.
`tile-phone.sh <snapshot> <outdir> <tag> [zoom] [tiles]` renders it through
`qlmanage` as N stacked viewport tiles, so a tall phone screen is readable
top to bottom.

## Why each step is there

Every one of these was a wrong conclusion first, and a fix second.

- **`qlmanage` needs `dangerouslyDisableSandbox: true`** — under the Bash
  sandbox it fails with `sandbox initialization failed: Operation not
  permitted`. So does `npm run dev` (see `.claude/rules/shipping.md` §3).
- **Media queries are resolved into the sheet at the target width.** Quick Look
  renders into a square viewport of its own choosing and CSS `zoom` does NOT
  change media-query evaluation — so a 390px-wide body still matched `lg:` and
  painted the two-column DESKTOP layout. That looked exactly like a broken
  mobile screen and is not one.
- **Pre-mount motion state is settled.** Scripts are stripped so the capture is
  deterministic, which means framer-motion's `opacity:0;transform:translateY()`
  initial style is never animated in — the page renders blank. Inline `opacity:0`
  / `translate` / `animation-delay` declarations are dropped, and
  `.animate-fade-in-up` is pinned to its end state.
- **`srcSet` is stripped CASE-INSENSITIVELY.** React serialises the attribute
  as `srcSet`; a case-sensitive strip leaves it, WebKit prefers a candidate from
  it over the inlined `src`, and every photo renders as the broken-image glyph.
  The course surfaces are image-forward, so that reads as a design defect that
  is not there.
- **Images are downsampled through `sips` before inlining.** Quick Look renders
  a data: image fine on its own but drops them once the document gets large.
- **Images are forced `opacity:1`.** `next/image` fades in from `opacity-0` on
  its `onLoad` handler, which never fires with scripts stripped.
- **A class in the markup with no rule in the CSS is reported.** Turbopack dev
  generates a route's CSS chunk on demand, so the FIRST response for a new route
  can link a sheet that lacks that route's own classes — measured, with
  `w-[390px]` present in the markup and absent from the CSS. The route is warmed
  before it is read, and anything still unresolved is printed as a WARN.

## What it does not do

Static markup only — no hover, focus, scroll or open-overlay states, and no
JS-measured layout. For those, drive the real browser.
