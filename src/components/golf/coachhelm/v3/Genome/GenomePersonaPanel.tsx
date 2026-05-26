import type { Persona } from '@/lib/coachhelm/v3/genome/persona';

interface Props {
  persona: Persona;
}

export function GenomePersonaPanel({ persona }: Props) {
  const hasStrengths = persona.strengths.length > 0;
  const hasWatchouts = persona.watchouts.length > 0;
  return (
    <div className="space-y-7">
      <Section title="Strengths" emptyHint="Needs more rounds to surface strengths.">
        {hasStrengths && (
          <ul className="space-y-2">
            {persona.strengths.map((s) => (
              <Bullet key={s.dim_id} accent="emerald" label={s.label} qualitative={s.qualitative} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Watchouts" emptyHint="No watchouts at the moment.">
        {hasWatchouts && (
          <ul className="space-y-2">
            {persona.watchouts.map((s) => (
              <Bullet key={s.dim_id} accent="amber" label={s.label} qualitative={s.qualitative} />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Course profile">
        <p className="text-[15px] text-warm-800 leading-relaxed">{persona.course_profile}</p>
      </Section>
    </div>
  );
}

function Section({
  title,
  emptyHint,
  children,
}: {
  title: string;
  emptyHint?: string;
  children?: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-warm-500 mb-2.5">
        {title}
      </h3>
      {children ?? (
        <p className="text-sm text-warm-400 italic">{emptyHint}</p>
      )}
    </section>
  );
}

const ACCENT_STYLES = {
  emerald: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-900',
  },
  amber: {
    dot: 'bg-amber-500',
    text: 'text-amber-900',
  },
} as const;

function Bullet({
  accent,
  label,
  qualitative,
}: {
  accent: keyof typeof ACCENT_STYLES;
  label: string;
  qualitative: string | null;
}) {
  const styles = ACCENT_STYLES[accent];
  return (
    <li className="flex items-baseline gap-2.5">
      <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${styles.dot}`} />
      <span className={`text-[15px] ${styles.text}`}>
        <span className="font-medium">{label}</span>
        {qualitative && <span className="text-warm-700"> · {qualitative}</span>}
      </span>
    </li>
  );
}
