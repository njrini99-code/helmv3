/**
 * photoBg.ts — graded-photography-over-gradient CSS helper.
 *
 * Photo assets (`public/marketing/first-light/photos/{hero,golf,baseball,mist}.jpg`)
 * are sourced by a parallel lane and may not exist yet at any given point in
 * the build. Using a plain `<img>`/`next/image` for hero photography means a
 * missing file paints a visibly broken image. CSS `background-image` with a
 * layered gradient UNDER the `url(...)` layer degrades gracefully instead —
 * if the photo 404s, that background layer simply doesn't paint and the
 * gradient underneath (always present) carries the section. See
 * CONTRACTS.md "Photo asset contract."
 */
import type { CSSProperties } from 'react';

export interface PhotoLayerOptions {
  /** Path under `public/`, e.g. `/marketing/first-light/photos/hero.jpg`. */
  src: string;
  /** A CSS gradient (or comma-separated gradients) painted BELOW the photo —
   * this is what renders if `src` 404s, so it must read as a complete,
   * on-brand background by itself (the graded pine/clay/ecru fallback). */
  fallbackGradient: string;
  backgroundPosition?: string;
}

/** Returns an inline `style` object: graded gradient + photo, cover/center. */
export function photoLayerStyle({
  src,
  fallbackGradient,
  backgroundPosition = 'center',
}: PhotoLayerOptions): CSSProperties {
  return {
    backgroundImage: `${fallbackGradient}, url(${src})`,
    backgroundSize: 'cover',
    backgroundPosition,
    backgroundRepeat: 'no-repeat',
  };
}
