'use client';

import { AnimatePresence, m } from 'framer-motion';
import { Check } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, isOffline } from '../../lib/use-action';
import { haptic } from '../../lib/haptics';
import { useToast } from '../../ui/Toast';
import type { ChProblem, ChResult } from './model';

/**
 * A settings card is the design system's Surface: 15px title, caption
 * subtitle, actions on the right, a 16/20 body, and the ivory footer bar
 * (status on the left, Save on the right).
 */
export function Card({
  id,
  title,
  description,
  aside,
  foot,
  children,
  code,
}: {
  id?: string;
  /** Catalog number when the card itself is a state (for example an empty state). */
  code?: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  foot?: ReactNode;
  tone?: 'danger';
  children?: ReactNode;
}) {
  return (
    <section className="ch-surface" aria-labelledby={id ? `${id}-t` : undefined} data-ch-code={code}>
      <div className="ch-surface__head">
        <div style={{ minWidth: 0 }}>
          <h3 id={id ? `${id}-t` : undefined} className="ch-surface__title">
            {title}
          </h3>
          {description && <div className="ch-surface__sub">{description}</div>}
        </div>
        {aside && <div className="ch-surface__actions">{aside}</div>}
      </div>
      {children && <div className="ch-surface__body ch-set-stackbody">{children}</div>}
      {foot && <div className="ch-surface__foot">{foot}</div>}
    </section>
  );
}

/** One setting: label and help on the left, the control on the right (stacks when narrow). */
export function Row({ label, help, htmlFor, children, dim }: { label: ReactNode; help?: ReactNode; htmlFor?: string; children: ReactNode; dim?: boolean }) {
  return (
    <div className={'ch-set-row' + (dim ? ' is-dim' : '')}>
      <div className="ch-set-row__txt">
        {htmlFor ? (
          <label htmlFor={htmlFor} className="ch-set-row__l">
            {label}
          </label>
        ) : (
          <span className="ch-set-row__l">{label}</span>
        )}
        {help && <span className="ch-set-row__h">{help}</span>}
      </div>
      <div className="ch-set-row__c">{children}</div>
    </div>
  );
}

/** A labelled text field on the form grid. */
export function Field({
  id,
  label,
  help,
  error,
  span = 1,
  ...input
}: {
  id: string;
  label: string;
  help?: string;
  error?: ChProblem | null;
  span?: 1 | 2;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={'ch-field' + (span === 2 ? ' ch-set-span2' : '')}>
      <label htmlFor={id} className="ch-field__label">
        {label}
      </label>
      <input id={id} className="ch-input" aria-invalid={error ? true : undefined} aria-describedby={help || error ? `${id}-h` : undefined} {...input} />
      {(error || help) && (
        <span id={`${id}-h`} className={'ch-field__help' + (error ? ' is-error' : '')} role={error ? 'alert' : undefined} data-ch-code={error?.code}>
          {error?.text || help}
        </span>
      )}
    </div>
  );
}

/**
 * The footer of an edit card: what's pending, and Save. After a save it
 * confirms for a moment ("Saved") and then settles, so the change reads as
 * done without a lingering banner.
 */
export function SaveBar({
  dirty,
  pending,
  invalid,
  onSave,
  onReset,
  label = 'Save changes',
  savedAt,
}: {
  dirty: boolean;
  pending: boolean;
  invalid?: ChProblem | null;
  onSave: () => void;
  onReset?: () => void;
  label?: string;
  savedAt: number;
}) {
  const reduced = useChReducedMotion();
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1800);
    return () => window.clearTimeout(t);
  }, [savedAt]);
  return (
    <>
      <span className="ch-set-status" aria-live="polite" data-ch-code={pending ? 'CH-8402' : undefined}>
        <AnimatePresence mode="wait" initial={false}>
          {invalid && dirty ? (
            <m.span key="inv" className="is-invalid" data-ch-code={invalid.code} initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={chTween('quick')}>
              {invalid.text}
            </m.span>
          ) : dirty ? (
            <m.span key="dirty" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={chTween('quick')}>
              <i className="ch-set-dot" aria-hidden />
              Unsaved changes
            </m.span>
          ) : flash ? (
            <m.span key="saved" className="is-saved" initial={reduced ? false : { opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={chTween('quick')}>
              <Icon icon={Check} size={14} />
              Saved
            </m.span>
          ) : null}
        </AnimatePresence>
      </span>
      {onReset && dirty && !pending && (
        <Button variant="ghost" size="sm" onClick={onReset}>
          Discard
        </Button>
      )}
      <Button variant="primary" size="sm" disabled={!dirty || pending || !!invalid} onClick={onSave}>
        {pending ? 'Saving…' : label}
      </Button>
    </>
  );
}

/** A section whose read failed: says so, keeps the form away, offers a reload. */
export function ReadFailed({ what, onRetry, code }: { what: string; onRetry: () => void; code: string }) {
  return (
    <div className="ch-surface ch-set-failed">
      <InlineNotice code={code} title={`${what} didn't load.`} body="Nothing was changed. Reload to try again; the error has been reported." onRetry={onRetry} />
    </div>
  );
}

/**
 * Unsaved-changes guard. While any card is dirty: the browser asks before
 * unload, and an in-app link to another page asks first in a Clubhouse modal.
 * Same-page and hash links pass through.
 */
export function useUnsavedGuard(dirty: boolean) {
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty) return;
    // CH-8508: while anything is unsaved, closing or reloading the tab asks first.
    document.documentElement.dataset.chGuard = 'CH-8508';
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank') return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      chTrail('settings unsaved guard');
      setPendingHref(url.pathname + url.search + url.hash);
    };
    window.addEventListener('beforeunload', onUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      delete document.documentElement.dataset.chGuard;
      window.removeEventListener('beforeunload', onUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  const modal = (
    <Modal
      open={pendingHref != null}
      code="CH-8506"
      onClose={() => setPendingHref(null)}
      title="Leave without saving?"
      description="Your changes on this page haven't been saved."
      footer={
        <>
          <Button variant="secondary" onClick={() => setPendingHref(null)}>
            Keep editing
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              const href = pendingHref;
              setPendingHref(null);
              if (href) window.location.assign(href);
            }}
          >
            Discard and leave
          </Button>
        </>
      }
    />
  );
  return modal;
}

/** Tracks a form against its last saved value. */
export function useDraft<T>(saved: T) {
  const [base, setBase] = useState(saved);
  const [draft, setDraft] = useState(saved);
  const [savedAt, setSavedAt] = useState(0);
  const dirty = JSON.stringify(base) !== JSON.stringify(draft);
  return {
    draft,
    setDraft,
    dirty,
    savedAt,
    reset: () => setDraft(base),
    commit: (v: T = draft) => {
      setBase(v);
      setDraft(v);
      setSavedAt(Date.now());
    },
  };
}


/** Each edit card reports whether it holds unsaved changes; the page guards on any. */
export const DirtyContext = createContext<(id: string, dirty: boolean) => void>(() => {});

export function useReportDirty(id: string, dirty: boolean) {
  const report = useContext(DirtyContext);
  useEffect(() => {
    report(id, dirty);
    return () => report(id, false);
  }, [id, dirty, report]);
}

/**
 * Instant settings (switches, pickers): the new value shows at once, the
 * save runs behind it, and a failure puts the old value back, says what
 * failed with Retry, fires the error haptic and reports to Sentry. Keys save
 * independently, so flipping two switches quickly never blocks either one.
 */
export interface InstantSave {
  key: string;
  /** Show the new value. */
  apply: () => void;
  /** Put the old value back. */
  rollback: () => void;
  write: () => Promise<ChResult>;
  failed: string;
  /** Catalog number of the failure toast. */
  code: string;
}

export function useInstantSave(surface: string) {
  const toast = useToast();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const run = async (op: InstantSave): Promise<boolean> => {
    if (isOffline()) {
      // CH-1903: refuse at once while offline, instead of flipping and flipping back.
      haptic('error');
      toast({ tone: 'error', title: `${op.failed}: you're offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
      return false;
    }
    op.apply();
    setPending((s) => new Set(s).add(op.key));
    chTrail(`settings ${surface} ${op.key}`);
    const slow = window.setTimeout(() => toast({ title: 'Still saving…', body: 'This is taking longer than usual. Keep this page open.', code: 'CH-1902' }), CH_SLOW_SAVE_AFTER);
    let r: ChResult;
    try {
      r = await op.write();
    } catch (err) {
      chReport(err, { surface: `settings.${surface}`, action: op.key });
      r = { success: false };
    } finally {
      window.clearTimeout(slow);
    }
    setPending((s) => {
      const n = new Set(s);
      n.delete(op.key);
      return n;
    });
    if (r.success || r.ok) {
      haptic('commit');
      return true;
    }
    op.rollback();
    haptic('error');
    if (r.error) chReport(new Error(r.error), { surface: `settings.${surface}`, action: op.key, severity: 'low' });
    toast({
      tone: 'error',
      title: op.failed,
      body: 'It is back where it was. Check your connection and try again.',
      action: { label: 'Retry', run: () => void run(op) },
      code: op.code,
    });
    return false;
  };
  return { run, pending };
}

/** A settings switch: while its save is in flight it carries CH-8403 (holds its position, can't flip again). */
export function SettingSwitch(props: React.ComponentProps<typeof Switch>) {
  return <Switch {...props} busyCode="CH-8403" />;
}
