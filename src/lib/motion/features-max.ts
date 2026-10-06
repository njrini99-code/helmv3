/**
 * Local re-export wrapper for framer-motion's `domMax` feature bundle
 * (`domAnimation` + drag + layout/shared-layout support).
 *
 * See `./features-min` for why this needs to be its own module rather than
 * `loadMaxFeatures` dynamically importing `'motion/react'` directly.
 */
export { domMax as default } from 'motion/react';
