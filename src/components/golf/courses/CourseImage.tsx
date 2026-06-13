import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * The visual heart of every course surface. Renders the uploaded course photo
 * when present; otherwise a deterministic, on-brand green gradient + the course
 * monogram (so the library looks premium before any photo exists). A bottom
 * scrim is available for cards that overlay text on the image.
 */

// Scenic course-landscape palettes (cohesive with the helm-green accent family;
// never a random rainbow). Each evokes sky → treeline → fairway → green so the
// no-photo state reads as a course vista, not a flat block.
interface ScenicPalette {
  sky: string;
  hills: string;
  fairway: string;
  green: string;
}
const SCENES: ReadonlyArray<ScenicPalette> = [
  // dawn links
  { sky: 'oklch(0.88 0.05 200)', hills: 'oklch(0.46 0.09 158)', fairway: 'oklch(0.66 0.13 150)', green: 'oklch(0.58 0.13 148)' },
  // bright parkland
  { sky: 'oklch(0.90 0.06 210)', hills: 'oklch(0.44 0.10 165)', fairway: 'oklch(0.70 0.13 145)', green: 'oklch(0.62 0.14 142)' },
  // pine highlands
  { sky: 'oklch(0.85 0.04 195)', hills: 'oklch(0.40 0.09 172)', fairway: 'oklch(0.64 0.12 158)', green: 'oklch(0.55 0.12 162)' },
  // coastal meadow
  { sky: 'oklch(0.89 0.06 215)', hills: 'oklch(0.47 0.10 150)', fairway: 'oklch(0.68 0.13 152)', green: 'oklch(0.60 0.13 146)' },
  // dusk fairway (warmer sky)
  { sky: 'oklch(0.86 0.06 90)', hills: 'oklch(0.43 0.10 160)', fairway: 'oklch(0.66 0.13 148)', green: 'oklch(0.57 0.13 150)' },
  // emerald valley
  { sky: 'oklch(0.87 0.05 205)', hills: 'oklch(0.42 0.10 168)', fairway: 'oklch(0.69 0.14 140)', green: 'oklch(0.61 0.14 138)' },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Layered gradient evoking a course vista: sky band, rolling treeline, sunlit
 *  fairway, and a green in the foreground. Deterministic per course name. */
function scenicBackground(scene: ScenicPalette, sunLeft: boolean): string {
  const sunX = sunLeft ? '22%' : '80%';
  return [
    // soft sun glow
    `radial-gradient(60% 45% at ${sunX} 14%, oklch(0.98 0.05 95 / 0.55), transparent 60%)`,
    // foreground green (bottom)
    `linear-gradient(0deg, ${scene.green} 0%, transparent 34%)`,
    // rolling hills / treeline (middle)
    `radial-gradient(140% 70% at 50% 78%, ${scene.fairway} 0%, ${scene.fairway} 38%, transparent 62%)`,
    `radial-gradient(120% 55% at 30% 58%, ${scene.hills} 0%, transparent 55%)`,
    `radial-gradient(120% 55% at 75% 60%, ${scene.hills} 0%, transparent 52%)`,
    // sky (top)
    `linear-gradient(180deg, ${scene.sky} 0%, ${scene.fairway} 70%, ${scene.green} 100%)`,
  ].join(', ');
}

/** Up to two initials from the first significant words (skips number/No tokens). */
function monogram(name: string): string {
  const words = name
    .replace(/[#]/g, ' ')
    .split(/\s+/)
    .filter((w) => /[a-z]/i.test(w) && !/^(the|no|number|at|of|and|&)$/i.test(w));
  if (words.length === 0) return (name.trim()[0] ?? '•').toUpperCase();
  const initials = words.slice(0, 2).map((w) => w[0]!.toUpperCase());
  return initials.join('');
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
    <div className={cn('relative isolate h-full w-full overflow-hidden bg-surface-sunken [container-type:size]', className)}>
      {imageUrl ? (
        // Real photo always fills its slot edge-to-edge (object-cover) — no
        // letterboxing or stretch, regardless of the source aspect ratio.
        <Image
          src={imageUrl}
          alt={`${name} course photo`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      ) : (
        // Scenic course-vista placeholder (sky → treeline → fairway → green).
        <div
          aria-hidden
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: scenicBackground(scene, h % 2 === 0) }}
        >
          <span className="font-fw-display text-[clamp(1.75rem,8cqw,3.25rem)] font-semibold tracking-tight text-white/85 drop-shadow-md select-none">
            {monogram(name)}
          </span>
        </div>
      )}

      {scrim && (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent"
        />
      )}
    </div>
  );
}
