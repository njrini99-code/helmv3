'use client';

import { m } from 'framer-motion';
import type { Persona } from '@/lib/coachhelm/v3/genome/persona';
import { enterVariants, enterTransition, stagger } from '@/lib/coachhelm/v3/motion';

interface Props {
  persona: Persona;
}

export function GenomePersonaPanel({ persona }: Props) {
  const hasStrengths = persona.strengths.length > 0;
  const hasWatchouts = persona.watchouts.length > 0;
  return (
    <div className="space-y-7">
      <Section index={0} title="Strengths" emptyHint="Needs more rounds to surface strengths.">
        {hasStrengths && (
          <ul className="space-y-2.5">
            {persona.strengths.map((s, i) => (
              <Bullet
                key={s.dim_id}
                index={i}
                accent="emerald"
                label={s.label}
                qualitative={s.qualitative}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section index={1} title="Watchouts" emptyHint="No watchouts at the moment.">
        {hasWatchouts && (
          <ul className="space-y-2.5">
            {persona.watchouts.map((s, i) => (
              <Bullet
                key={s.dim_id}
                index={i}
                accent="amber"
                label={s.label}
                qualitative={s.qualitative}
              />
            ))}
          </ul>
        )}
      </Section>

      <Section index={2} title="Course profile">
        <p className="text-[15px] text-warm-800 leading-relaxed">{persona.course_profile}</p>
      </Section>
    </div>
  );
}

function Section({
  index,
  title,
  emptyHint,
  children,
}: {
  index: number;
  title: string;
  emptyHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <m.section
      variants={enterVariants}
      initial="hidden"
      animate="visible"
      transition={{ ...enterTransition, delay: stagger(index) }}
    >
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-warm-500 mb-2.5">
        {title}
      </h3>
      {children ?? (
        <p className="text-sm text-warm-400 italic">{emptyHint}</p>
      )}
    </m.section>
  );
}

const ACCENT_STYLES = {
  emerald: {
    dot: 'bg-emerald-500',
    glow: 'shadow-[0_0_0_3px_rgba(16,185,129,0.12)]',
    text: 'text-emerald-900',
  },
  amber: {
    dot: 'bg-amber-500',
    glow: 'shadow-[0_0_0_3px_rgba(245,158,11,0.12)]',
    text: 'text-amber-900',
  },
} as const;

function Bullet({
  index,
  accent,
  label,
  qualitative,
}: {
  index: number;
  accent: keyof typeof ACCENT_STYLES;
  label: string;
  qualitative: string | null;
}) {
  const styles = ACCENT_STYLES[accent];
  return (
    <m.li
      variants={enterVariants}
      initial="hidden"
      animate="visible"
      transition={{ ...enterTransition, delay: 0.1 + stagger(index) }}
      className="flex items-baseline gap-3"
    >
      <span
        aria-hidden
        className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot} ${styles.glow}`}
      />
      <span className={`text-[15px] ${styles.text}`}>
        <span className="font-medium">{label}</span>
        {qualitative && <span className="text-warm-700"> · {qualitative}</span>}
      </span>
    </m.li>
  );
}
