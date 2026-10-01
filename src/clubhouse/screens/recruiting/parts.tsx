'use client';

import { Mail, NotebookPen, Phone, UserRound, type LucideIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { dateLabel, mailHref, stageMeta, telHref, whenLabel, type ChProspect, type ChStage } from '../../data/recruiting-shape';
import { initials } from '../../lib/format';
import { Icon } from '../../ui/Icon';

/** The stage as a chip: Watched grey, Recruiting green, Offered deeper green, Committed the darkest. */
export function StageChip({ stage, size = 'md' }: { stage: ChStage; size?: 'md' | 'lg' }) {
  return <span className={`ch-rec-chip is-${stage}` + (size === 'lg' ? ' is-lg' : '')}>{stageMeta(stage).label}</span>;
}

/** A monogram coin. The panel's and the detail's coin is the dark green once an offer is out. */
export function ProspectAvatar({ name, size, strong = false }: { name: string; size: number; strong?: boolean }) {
  return (
    <span className={'ch-rec-av' + (strong ? ' is-strong' : '')} style={{ ['--ch-rec-av' as string]: `${size}px` } as CSSProperties} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export const isStrong = (stage: ChStage) => stage === 'offered' || stage === 'committed';

/** A part of a prospect with nothing in it yet: an icon, what is missing, a line on what it is for, and the one way to add it. */
export function EmptyRow({
  code,
  icon,
  title,
  body,
  actionLabel,
  onAction,
}: {
  code: string;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="ch-rec-empty" data-ch-code={code}>
      <span className="ch-rec-empty__ic" aria-hidden="true">
        <Icon icon={icon} size={18} />
      </span>
      <span className="ch-rec-empty__t">
        <b>{title}</b>
        <span>{body}</span>
      </span>
      <button type="button" className="ch-rec-empty__a" onClick={onAction}>
        {actionLabel}
      </button>
    </div>
  );
}

/** Email and Call are links only (mailto: and tel:): nothing is sent from GolfHelm. Real links, named by what they do (CH-14805). */
export function ContactRows({ p }: { p: ChProspect }) {
  return (
    <div className="ch-rec-rows">
      {p.email && (
        <a className="ch-rec-row" href={mailHref(p.email)}>
          <Icon icon={Mail} size={17} />
          <span className="ch-rec-row__v">{p.email}</span>
          <span className="ch-rec-row__a">Email</span>
        </a>
      )}
      {p.phone && (
        <a className="ch-rec-row" href={telHref(p.phone)}>
          <Icon icon={Phone} size={17} />
          <span className="ch-rec-row__v">{p.phone}</span>
          <span className="ch-rec-row__a">Call</span>
        </a>
      )}
    </div>
  );
}

export function ContactSection({ p, onAdd }: { p: ChProspect; onAdd: () => void }) {
  return (
    <section className="ch-rec-sec" aria-label="Contact">
      <h3>Contact</h3>
      {p.email || p.phone ? (
        <ContactRows p={p} />
      ) : (
        <EmptyRow code="CH-14303" icon={UserRound} title="No contact details yet" body={`Add an email or phone number to reach ${p.firstName} or their family from here.`} actionLabel="Add" onAction={onAdd} />
      )}
    </section>
  );
}

export function NotesSection({ p, onAdd }: { p: ChProspect; onAdd: () => void }) {
  return (
    <section className="ch-rec-sec" aria-label="Notes">
      <h3>Notes</h3>
      {p.notes ? (
        <p className="ch-rec-notes">{p.notes}</p>
      ) : (
        <EmptyRow code="CH-14304" icon={NotebookPen} title="No notes yet" body="Where you saw them, what stood out, and what happens next." actionLabel="Add a note" onAction={onAdd} />
      )}
    </section>
  );
}

/** "Added Aug 12 · Updated 2 days ago". A prospect never changed since it was added says only when it was added. */
export function MetaLine({ p, now, tz }: { p: ChProspect; now: Date; tz?: string }) {
  const changed = Math.abs(new Date(p.updatedAt).getTime() - new Date(p.createdAt).getTime()) > 60_000;
  return (
    <span className="ch-rec-meta">
      Added {dateLabel(p.createdAt, now, tz)}
      {changed && <> · Updated {whenLabel(p.updatedAt, now, tz).replace(/^Today$/, 'today').replace(/^Yesterday$/, 'yesterday')}</>}
    </span>
  );
}
