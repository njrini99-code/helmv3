import type { ReactNode } from 'react';

/**
 * A zone: one area of a page set off by a gold rule. On the left what the area is, in a sentence, and one reading; on the right
 * the picture that fits it. Player stats (Overview, Rounds, Development) and the round review share it, so a page of zones
 * reads as one family. Wrap a page's zones in `Zones` (it sets the width the columns collapse at).
 */
export function Zones({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={'ch-zns' + (className ? ` ${className}` : '')}>{children}</div>;
}

export function Zone({
  n,
  title,
  def,
  alt = false,
  wide = false,
  read,
  children,
}: {
  n: number;
  title: string;
  def: ReactNode;
  alt?: boolean;
  /** The picture needs the full width (a table): the sentence moves above it. */
  wide?: boolean;
  read?: ReactNode;
  children: ReactNode;
}) {
  const id = `ch-zn-${zoneId(title, n)}`;
  return (
    <section className={'ch-zn' + (alt ? ' ch-zn--alt' : '') + (wide ? ' ch-zn--wide' : '')} aria-labelledby={id}>
      <div className="ch-zn__id">
        <span className="ch-zn__n" aria-hidden="true">
          {n}
        </span>
        <h2 id={id}>{title}</h2>
        <p className="ch-zn__def">{def}</p>
        {read && <div className="ch-zn__read">{read}</div>}
      </div>
      <div className="ch-zn__vis">{children}</div>
    </section>
  );
}

/**
 * A titled picture inside a zone. Give it an id to name a region (the heading carries it); `region={false}` keeps the id
 * but names no region, for a block whose title repeats its zone's, so two landmarks never share a name (F-0064).
 */
export function ZoneBlock({ title, note, id, region = true, children }: { title: string; note?: ReactNode; id?: string; region?: boolean; children: ReactNode }) {
  return (
    <section className="ch-znb" aria-labelledby={region ? id : undefined}>
      <h3 id={id}>{title}</h3>
      {note && <p>{note}</p>}
      {children}
    </section>
  );
}

/** The zone's one big reading. `tone` colours it: good is green, bad is gold (D-42: losses are amber, never red). `settle` makes it settle in when it is remounted for a new value (give it a key). */
export function ZoneBig({ value, unit, tone, settle = false }: { value: string; unit?: string; tone?: 'good' | 'bad'; settle?: boolean }) {
  return (
    <span className={'ch-znbig ch-num' + (tone ? ` is-${tone === 'good' ? 'gain' : 'loss'}` : '') + (settle ? ' is-settle' : '')}>
      {value}
      {unit && <small>{unit}</small>}
    </span>
  );
}

export function ZoneNote({ children }: { children: ReactNode }) {
  return <p className="ch-znmiss">{children}</p>;
}

function zoneId(title: string, n: number) {
  return `${n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
