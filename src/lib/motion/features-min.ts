/**
 * Local re-export wrapper for framer-motion's `domAnimation` feature bundle.
 *
 * `<LazyMotion>` only code-splits when its `features` loader targets a module
 * specifier that has no OTHER synchronous import edge into the same chunk.
 * Every file that calls `loadFeatures()` (see `./load-features`) also
 * statically imports `{ LazyMotion, m, ... }` from `'framer-motion'` at its
 * top — and framer-motion's package entry (`dist/es/index.mjs`) re-exports
 * `domAnimation`/`domMax` directly from that SAME specifier. Dynamically
 * importing `'framer-motion'` itself therefore resolves to a module already
 * required synchronously in that file, so bundlers can't split the feature
 * payload into its own chunk. Routing the dynamic import through this
 * dedicated file (which nothing imports statically) gives it a specifier
 * with no synchronous edge, so it — and the animation/gesture code it pulls
 * in — can load lazily as intended. This matches framer-motion's own
 * documented LazyMotion code-splitting pattern.
 */
export { domAnimation as default } from 'framer-motion';
