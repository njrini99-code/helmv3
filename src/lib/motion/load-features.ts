/**
 * Real async feature loaders for framer-motion's `<LazyMotion>`.
 *
 * `<LazyMotion features={domAnimation}>` only code-splits the animation
 * engine when `features` is a loader FUNCTION — passing the imported
 * `domAnimation`/`domMax` object directly (as most call sites in this repo
 * did) forces webpack to bundle the ~15-25kB feature payload into the same
 * chunk as the importing file, defeating the whole point of "lazy" motion.
 *
 * The loaders below import from local `./features-min` / `./features-max`
 * wrapper modules instead of `'framer-motion'` directly. Every call site
 * that uses `<LazyMotion>` also statically imports `{ LazyMotion, m, ... }`
 * from `'framer-motion'` in the same file, and framer-motion's package entry
 * re-exports `domAnimation`/`domMax` from that identical specifier — so a
 * dynamic `import('framer-motion')` there resolves to a module already
 * required synchronously and can't be split into its own chunk. Routing
 * through a dedicated file with no synchronous import edge is framer-motion's
 * own documented pattern for making this code-split for real.
 *
 * Use `loadFeatures` for the common case (`m.div`, `m.button`, entrance/exit
 * animations, gestures). Use `loadMaxFeatures` only where drag or
 * layout-animation features are actually used (`domMax` superset).
 */
export const loadFeatures = () => import('./features-min').then((mod) => mod.default);

export const loadMaxFeatures = () => import('./features-max').then((mod) => mod.default);
