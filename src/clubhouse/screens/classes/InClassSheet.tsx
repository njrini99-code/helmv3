'use client';

import { Icon } from '../../ui/Icon';
import { ChevronRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type RefObject } from 'react';
import type { ChClassDay } from '../../data/class-day-shape';
import { teamNow, statusClock, type ChStatusTextOptions } from '../../data/class-status';
import { Button, IconButton } from '../../ui/Button';
import { ClassStatusRow } from '../../ui/ClassStatusRow';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import { pluralWord } from '../../lib/plural';
import { useChPhone } from '../../lib/use-phone';
import { usePopoverFit } from '../../lib/use-popover-fit';
import { rebuiltHref } from '../../shell/nav';
import { messagesPrefillHref } from '../messages/prefill';
import { sheetModel, termRow, type SheetRow } from './in-class-model';
import { TodayStrip } from './TodayStrip';
import '../../styles/class-awareness.css';

/**
 * P-10 class awareness: the "In class now" sheet from Coach Home's line. A phone bottom sheet (Modal), or on desktop a
 * popover anchored to the line, 380 wide with its own scroll. Today strip, then In class, Next today, Travelling and
 * No class status, then the term row (Edit) and "Mark a day with no classes". A row opens that player's 1:1 thread (the
 * sheet closes first). Coach only: class names show to coaches only.
 *
 * Loading shows nothing for 300 ms and then "Loading class status"; an error says so with Try again; offline keeps the
 * last payload and says when it was fetched.
 */
const ASK =
  'Could you add your class schedule in Clubhouse (Classes)? It lets me see when you’re in class so I don’t message you mid-lecture, and your pushes wait until class ends.';

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

function useOffline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => !navigator.onLine,
    () => false,
  );
}

function useAfter(ms: number, active: boolean): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) {
      setDone(false);
      return;
    }
    const t = window.setTimeout(() => setDone(true), ms);
    return () => window.clearTimeout(t);
  }, [ms, active]);
  return done;
}

export type InClassSheetProps = {
  open: boolean;
  onClose: () => void;
  day: ChClassDay | null;
  /** 'error' draws the failure with Try again; 'loading' and 'idle' the delayed loading line. */
  status: 'idle' | 'loading' | 'ready' | 'error';
  now: number | null;
  opts: ChStatusTextOptions | null;
  onRetry: () => void;
  onEditTerm: () => void;
  onBreaks: () => void;
  /** Desktop: the popover opens from this element's wrapper and focus returns to it. */
  triggerRef: RefObject<HTMLElement | null>;
  /**
   * A group thread's sheet (P-10): the same sheet over a day already cut down to the group's players. It names how many are in the group,
   * has no "No class status" section (it would list everyone untracked and bury the point; a count closes the sheet instead) and no
   * term or break rows (those are the team's, edited from Home).
   */
  scope?: { kind: 'conversation'; total: number; noStatus: number };
};

export function InClassSheet(props: InClassSheetProps) {
  const phone = useChPhone();
  const { open, onClose } = props;
  const model = useMemo(() => (props.day && props.now != null && props.opts ? sheetModel(props.day, props.now, props.opts) : null), [props.day, props.now, props.opts]);
  const title = model?.title ?? 'In class now';
  const sub = model && props.scope ? `${model.inClass.length} of ${props.scope.total} in this group · Class names show to coaches only.` : model?.sub;
  if (phone) {
    return (
      <Modal open={open} onClose={onClose} width={420} title={title} description={sub}>
        <SheetBody {...props} model={model} />
      </Modal>
    );
  }
  return open ? <Popover {...props} model={model} title={title} sub={sub} /> : null;
}

function Popover(props: InClassSheetProps & { model: ReturnType<typeof sheetModel> | null; title: string; sub?: string }) {
  const { onClose, triggerRef, model, title, sub } = props;
  const ref = useRef<HTMLDivElement | null>(null);
  const placement = usePopoverFit(ref);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('h2')?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      close.current();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      close.current();
      triggerRef.current?.querySelector<HTMLElement>('button')?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [triggerRef]);
  const arrows = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...(ref.current?.querySelectorAll<HTMLElement>('.ch-ca-row.is-button') ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (!rows.length) return;
    e.preventDefault();
    const next = e.key === 'ArrowDown' ? Math.min(rows.length - 1, at + 1) : Math.max(0, at - 1);
    rows[next]?.focus();
  };
  return (
    // The keydown only moves focus between rows; every row is a button reachable with Tab as well.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={ref}
      className="ch-ca-pop"
      role="dialog"
      aria-label={title}
      onKeyDown={arrows}
      style={placement ? { left: placement.left, top: placement.top, maxHeight: placement.maxHeight } : { left: 0, top: '100%' }}
    >
      <header className="ch-ca-pop__head">
        <div>
          <h2 tabIndex={-1}>{title}</h2>
          {model && <p>{sub}</p>}
        </div>
        <IconButton icon={X} label="Close" size="sm" onClick={onClose} />
      </header>
      <SheetBody {...props} model={model} />
    </div>
  );
}

function SheetBody({ day, status, now, opts, onRetry, onEditTerm, onBreaks, onClose, model, scope }: InClassSheetProps & { model: ReturnType<typeof sheetModel> | null }) {
  const router = useRouter();
  const offline = useOffline();
  const waited = useAfter(300, !day && status !== 'error');
  const tn = day && now != null ? teamNow(day, now) : null;

  if (!day || !model || !opts) {
    if (status === 'error') {
      return (
        <div className="ch-ca-state" data-ch-code="CH-2270">
          <p>Class status didn’t load.</p>
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <div className="ch-ca-state is-loading" data-ch-code={waited ? 'CH-2470' : undefined}>
        {waited && (
          <>
            <Spinner size="sm" />
            <p>Loading class status</p>
          </>
        )}
      </div>
    );
  }

  const openThread = (row: SheetRow) => {
    onClose();
    const href = rebuiltHref(`/golf/dashboard/messages?player=${encodeURIComponent(row.playerId)}`);
    if (href) router.push(href);
  };
  const untracked = day.players.filter((p) => !p.tracked && !p.away?.confirmed);
  const lowCoverage = !!tn && tn.tracked * 2 < tn.total;
  const askHref = lowCoverage ? messagesPrefillHref({ players: untracked.map((p) => p.playerId), draft: ASK, title: 'Class schedules' }) : null;
  const term = termRow(day);
  const section = (heading: string, rows: SheetRow[]) =>
    rows.length === 0 ? null : (
      <section className="ch-ca-sec" aria-label={heading}>
        <h3>{heading}</h3>
        {rows.map((r) => (
          <ClassStatusRow key={r.playerId} name={r.name} avatarId={r.playerId} meta={r.meta} time={r.time} label={r.label} onSelect={() => openThread(r)} />
        ))}
      </section>
    );
  const updated = offline ? statusClock(day.fetchedAt, opts) : null;

  return (
    <div className="ch-ca-body">
      {offline && updated && <p className="ch-ca-updated" data-ch-code="CH-2970">Updated {updated}</p>}
      {model.strip && <TodayStrip strip={model.strip} />}
      {model.empty && (
        <p className="ch-ca-empty" data-ch-code="CH-2370">
          No one has a class today.
        </p>
      )}
      {section('In class', model.inClass)}
      {section('Next today', model.next)}
      {section('Travelling', model.travelling)}
      {!scope && (model.none.length > 0 || lowCoverage) && (
        <section className="ch-ca-sec" aria-label="No class status">
          <h3>{model.none.length > 0 ? `No class status · ${model.none.length}` : 'No class status'}</h3>
          {lowCoverage && tn && <p className="ch-ca-note">Class schedules shared by {tn.tracked} of {tn.total}.</p>}
          {model.none.length > 0 && <p className="ch-ca-names">{model.none.join(', ')}</p>}
          {askHref && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onClose();
                router.push(askHref);
              }}
            >
              Ask for schedules
            </Button>
          )}
        </section>
      )}
      {scope ? (
        scope.noStatus > 0 && (
          <footer className="ch-ca-foot">
            <p className="ch-ca-note">{scope.noStatus} {pluralWord(scope.noStatus, 'here has', 'here have')} no class status</p>
          </footer>
        )
      ) : (
      <footer className="ch-ca-foot">
        <div className="ch-ca-foot__row">
          <span>{term ?? 'No term dates set'}</span>
          <Button size="sm" variant="ghost" onClick={onEditTerm}>
            {term ? 'Edit' : 'Set dates'}
          </Button>
        </div>
        <button type="button" className="ch-ca-foot__row is-button" onClick={onBreaks}>
          <span>Mark a day with no classes</span>
          <Icon icon={ChevronRight} size={14} />
        </button>
      </footer>
      )}
    </div>
  );
}
