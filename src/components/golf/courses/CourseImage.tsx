import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The visual heart of every course surface. Renders the uploaded course photo
 * when present; otherwise a deterministic, premium "course vista" — a layered
 * gradient (sky → atmospheric treeline → sunlit fairway → foreground green) with
 * a soft sun glow, a fine photographic grain to kill banding, and an edge
 * vignette for depth. A bottom scrim is available for cards that overlay text.
 *
 * No monogram letters: those read as a placeholder. The vista + grain + scrim
 * are designed to look intentional on their own; the card's typography carries
 * identity.
 */

interface ScenicPalette {
  sky: string;
  haze: string;
  ridge: string;
  fairway: string;
  green: string;
}

// Cohesive course-vista palettes (helm-green family; never a random rainbow).
const SCENES: ReadonlyArray<ScenicPalette> = [
  // dawn links
  { sky: 'oklch(0.90 0.045 215)', haze: 'oklch(0.84 0.05 200)', ridge: 'oklch(0.42 0.085 162)', fairway: 'oklch(0.69 0.13 150)', green: 'oklch(0.55 0.13 152)' },
  // bright parkland
  { sky: 'oklch(0.92 0.05 210)', haze: 'oklch(0.86 0.055 195)', ridge: 'oklch(0.40 0.095 168)', fairway: 'oklch(0.72 0.135 145)', green: 'oklch(0.58 0.14 144)' },
  // pine highlands
  { sky: 'oklch(0.87 0.04 200)', haze: 'oklch(0.82 0.045 192)', ridge: 'oklch(0.37 0.085 174)', fairway: 'oklch(0.66 0.12 158)', green: 'oklch(0.52 0.12 162)' },
  // coastal meadow
  { sky: 'oklch(0.91 0.055 220)', haze: 'oklch(0.85 0.05 205)', ridge: 'oklch(0.43 0.095 150)', fairway: 'oklch(0.70 0.135 152)', green: 'oklch(0.57 0.13 148)' },
  // golden hour
  { sky: 'oklch(0.90 0.06 95)', haze: 'oklch(0.86 0.05 120)', ridge: 'oklch(0.40 0.095 158)', fairway: 'oklch(0.68 0.13 146)', green: 'oklch(0.54 0.13 150)' },
  // emerald valley
  { sky: 'oklch(0.88 0.05 205)', haze: 'oklch(0.83 0.05 198)', ridge: 'oklch(0.38 0.095 170)', fairway: 'oklch(0.71 0.14 140)', green: 'oklch(0.58 0.14 138)' },
];

// A fine fractal-noise grain (data-URI SVG) layered at low opacity — adds a
// photographic micro-texture and removes gradient banding on large cards.
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Layered course vista, deterministic per course name. */
function scenicBackground(scene: ScenicPalette, sunLeft: boolean): string {
  const sunX = sunLeft ? '26%' : '74%';
  return [
    // warm sun glow high in the sky
    `radial-gradient(34% 26% at ${sunX} 11%, oklch(0.99 0.06 95 / 0.55), transparent 70%)`,
    // foreground green, anchored bottom — the closest, richest band (raised higher)
    `radial-gradient(130% 82% at 50% 114%, ${scene.green} 0%, ${scene.green} 32%, transparent 66%)`,
    // sunlit fairway sweeping up the middle (taller, more present)
    `radial-gradient(145% 74% at 50% 90%, ${scene.fairway} 0%, ${scene.fairway} 42%, transparent 72%)`,
    // soft, hazy treeline ridges (atmospheric perspective)
    `radial-gradient(92% 40% at 30% 56%, ${scene.ridge} 0%, transparent 56%)`,
    `radial-gradient(92% 38% at 78% 58%, ${scene.ridge} 0%, transparent 54%)`,
    // sky → fairway → green wash (green arrives earlier so it reads as a course, not sky)
    `linear-gradient(180deg, ${scene.sky} 0%, ${scene.haze} 34%, ${scene.fairway} 64%, ${scene.green} 100%)`,
  ].join(', ');
}

export interface CourseImageProps {
  name: string;
  imageUrl?: string | null;
  /** Adds a bottom-up dark scrim for legible overlaid text (hero cards). */
  scrim?: boolean;
  /** next/image sizes hint. */
  sizes?: string;
  priority?: boolean;
  className?: string;
}

export function CourseImage({
  name,
  imageUrl,
  scrim = false,
  sizes = '(max-width: 768px) 100vw, 400px',
  priority = false,
  className,
}: CourseImageProps) {
  const h = hashString(name);
  const scene = SCENES[h % SCENES.length]!;

  return (
    <div className={cn('relative isolate h-full w-full overflow-hidden bg-surface-sunken', className)}>
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={`${name} course photo`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        <>
          {/* Layered course vista */}
          <div aria-hidden className="absolute inset-0" style={{ background: scenicBackground(scene, h % 2 === 0) }} />
          {/* Photographic grain — kills banding, adds texture */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.12] mix-blend-overlay"
            style={{ backgroundImage: GRAIN, backgroundSize: '160px 160px' }}
          />
          {/* Edge vignette for depth */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{ background: 'radial-gradient(120% 100% at 50% 38%, transparent 55%, rgba(0,0,0,0.22) 100%)' }}
          />
        </>
      )}

      {scrim && (
        // Eased multi-stop bottom scrim — guarantees legible overlaid text across
        // any photo/vista while keeping the top of the image clean.
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(to_top,rgba(8,18,12,0.82)_0%,rgba(8,18,12,0.58)_16%,rgba(8,18,12,0.28)_38%,rgba(8,18,12,0.07)_58%,transparent_72%)]"
        />
      )}
    </div>
  );
}
