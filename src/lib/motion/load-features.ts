/**
 * Real async feature loaders for framer-motion's `<LazyMotion>`.
 *
 * `<LazyMotion features={domAnimation}>` only code-splits the animation
 * engine when `features` is a loader FUNCTION — passing the imported
 * `domAnimation`/`domMax` object directly (as most call sites in this repo
 * did) forces webpack to bundle the ~15-25kB feature payload into the same
 * chunk as the importing file, defeating the whole point of "lazy" motion.
 *
 * Use `loadFeatures` for the common case (`m.div`, `m.button`, entrance/exit
 * animations, gestures). Use `loadMaxFeatures` only where drag or
 * layout-animation features are actually used (`domMax` superset).
 */
export const loadFeatures = () => import('framer-motion').then((mod) => mod.domAnimation);

export const loadMaxFeatures = () => import('framer-motion').then((mod) => mod.domMax);
