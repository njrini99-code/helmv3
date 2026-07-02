'use client';

/**
 * M4 · TWO FIELDS — the portal fork. docs/LANDING_ENTRY_WORLD_DESIGN.md M4.
 * Background register: diptych split — golf dawn (left) / baseball dusk
 * (right), graded to one light language, each a G2 glass card. Hover: the
 * field brightens, the other dims slightly. Mobile: stacked portals.
 */
import { useState } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { flFraunces } from '../fonts';
import { photoLayerStyle } from '../lib/photoBg';

export interface M4TwoFieldsProps {
  className?: string;
}

type FieldKey = 'golf' | 'baseball';

const FIELDS: Array<{
  key: FieldKey;
  title: string;
  line: string;
  href: string;
  fallbackGradient: string;
}> = [
  {
    key: 'golf',
    title: 'GolfHelm',
    line: 'College golf team management + the CoachHelm AI layer.',
    href: '/products#golfhelm',
    fallbackGradient:
      'linear-gradient(150deg, rgba(20,53,39,0.35) 0%, rgba(20,53,39,0.82) 100%), radial-gradient(ellipse 80% 60% at 30% 20%, rgba(245,241,230,0.18), transparent 60%)',
  },
  {
    key: 'baseball',
    title: 'BaseballHelm',
    line: 'College baseball recruiting + team management, coach to player.',
    href: '/products#baseballhelm',
    fallbackGradient:
      'linear-gradient(150deg, rgba(176,112,60,0.28) 0%, rgba(20,53,39,0.86) 100%), radial-gradient(ellipse 80% 60% at 70% 25%, rgba(176,141,87,0.16), transparent 60%)',
  },
];

export function M4TwoFields({ className }: M4TwoFieldsProps) {
  const [hovered, setHovered] = useState<FieldKey | null>(null);

  return (
    <section className={cn('relative', className)} style={{ backgroundColor: 'var(--fl-pine)' }}>
      <div className="mx-auto max-w-6xl px-6 pb-6 pt-20 text-center sm:pt-24">
        <span className="text-eyebrow font-semibold uppercase tracking-[0.28em] text-[rgba(var(--fl-ecru-rgb),0.5)]">
          One Helm. Two fields.
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const dimmed = hovered !== null && hovered !== field.key;
          return (
            <Link
              key={field.key}
              href={field.href}
              onMouseEnter={() => setHovered(field.key)}
              onMouseLeave={() => setHovered(null)}
              className="group relative flex min-h-[60vh] items-end overflow-hidden p-6 sm:min-h-[70vh] sm:p-10"
              style={{ backgroundColor: 'var(--fl-pine)' }}
            >
              <m.div
                animate={{ opacity: dimmed ? 0.55 : 1, scale: hovered === field.key ? 1.02 : 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0"
                style={photoLayerStyle({ src: `/marketing/first-light/photos/${field.key}.jpg`, fallbackGradient: field.fallbackGradient })}
              />
              <div className="fl-glass-2 relative w-full max-w-sm rounded-2xl p-6">
                <div className="relative z-10">
                  <h3 className={cn(flFraunces.className, 'text-2xl font-medium text-[var(--fl-ecru)] sm:text-3xl')}>
                    {field.title}
                  </h3>
                  <p className="mt-2 text-body text-[rgba(var(--fl-ecru-rgb),0.7)]">{field.line}</p>
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--fl-green)]">
                    Enter
                    <ArrowUpRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
