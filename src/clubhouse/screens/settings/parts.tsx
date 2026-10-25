'use client';

import { AnimatePresence, m } from 'motion/react';
import { Check } from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice, PageNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { chTween } from '../../lib/motion';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { chReport, chTrail } from '../../lib/track';
import { CH_SLOW_SAVE_AFTER, friendlyReason, isOffline, useAction, type ActionCopy, type ActionResult } from '../../lib/use-action';
import { isRawBrowserFailure } from '../../lib/friendly-reason';
import { haptic } from '../../lib/haptics';
import { useHydrationGuard } from '../../lib/use-hydration-guard';
import { useDelayedToast, useToast } from '../../ui/Toast';
import type { ChProblem, ChResult } from './model';

/**
 * A settings card is the design system's Surface: 15px title, caption
 * subtitle, actions on the right, a 16/20 body. A card that needs an explicit
 * save passes `save`: its bar appears under the fields only while there is
 * something to save (SaveBar), and Cmd/Ctrl+S saves it from anywhere in the card.
 */
export function Card({
  id,
  title,
  description,
  aside,
  foot,
  save,
  tone,
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
  /** The card's explicit save: the inline bar under its fields (SaveBar). */
  save?: SaveBarProps;
  tone?: 'danger';
  children?: ReactNode;
}) {
  const section = useRef<HTMLElement>(null);
  // Kept current for the listener, which is added once (a listener, not a JSX handler: the section is not a control).
  const latest = useRef(save);
  latest.current = save;
  const keyed = !!save;
  useEffect(() => {
    const el = section.current;
    if (!el || !keyed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const s = latest.current;
      if (!s) return;
      const target = e.target;
      const inField = target instanceof HTMLInputElement && !!target.closest('.ch-field') && !['checkbox', 'radio', 'file', 'button', 'range'].includes(target.type);
      const chord = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's';
      const enter = e.key === 'Enter' && s.enterSaves && inField && !e.shiftKey && !e.isComposing;
      if (!chord && !enter) return;
      e.preventDefault();
      if (s.dirty && !s.pending && !s.invalid) s.onSave();
    };
    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [keyed]);
  return (
    <section ref={section} className={'ch-surface' + (tone === 'danger' ? ' is-danger' : '')} aria-labelledby={id ? `${id}-t` : undefined} data-ch-code={code}>
      <div className="ch-surface__head">
        <div style={{ minWidth: 0 }}>
          <h2 id={id ? `${id}-t` : undefined} className="ch-surface__title">
            {title}
          </h2>
          {description && <div className="ch-surface__sub">{description}</div>}
        </div>
        {aside && <div className="ch-surface__actions">{aside}</div>}
      </div>
      {children && <div className="ch-surface__body ch-set-stackbody">{children}</div>}
      {save && <SaveBar {...save} />}
      {foot && <div className="ch-surface__foot">{foot}</div>}
    </section>
  );
}

/** CH-8901: the one line beside email switches while customer email is off for everyone. */
export function EmailPaused() {
  return <span data-ch-code="CH-8901">Email is paused for everyone right now.</span>;
}

/**
 * The quiet "Saved" beside a setting that saves as it changes. The live region is always there (so the word is
 * announced when it arrives); the word takes room only inside the label's own line, so nothing around it moves.
 */
export function SavedMark({ show }: { show: boolean }) {
  return (
    <span className="ch-set-saved" aria-live="polite">
      {show && (
        <span className="ch-set-saved__w" data-ch-code="CH-8405">
          <Icon icon={Check} size={13} />
          Saved
        </span>
      )}
    </span>
  );
}

/** One setting: label and help on the left, the control on the right (stacks when narrow). `saved`: it just saved. */
export function Row({ label, help, htmlFor, children, dim, saved, code }: { label: ReactNode; help?: ReactNode; htmlFor?: string; children: ReactNode; dim?: boolean; saved?: boolean; code?: string }) {
  return (
    <div className={'ch-set-row' + (dim ? ' is-dim' : '')} data-ch-code={code}>
      <div className="ch-set-row__txt">
        <span className="ch-set-row__top">
          {htmlFor ? (
            <label htmlFor={htmlFor} className="ch-set-row__l">
              {label}
            </label>
          ) : (
            <span className="ch-set-row__l">{label}</span>
          )}
          {saved !== undefined && <SavedMark show={saved} />}
        </span>
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
  // Read-only until hydrated, so text typed into the server markup is never wiped (the first name lost in WebKit).
  const guard = useHydrationGuard(input.readOnly);
  return (
    <div className={'ch-field' + (span === 2 ? ' ch-set-span2' : '')}>
      {/* CH-8807: every field has a label, and its help or error is read with it; CH-8804: the error is an alert. */}
      <label htmlFor={id} className="ch-field__label">
        {label}
      </label>
      <input id={id} className="ch-input" aria-invalid={error ? true : undefined} aria-describedby={help || error ? `${id}-h` : undefined} {...input} {...guard} />
      {(error || help) && (
        <span id={`${id}-h`} className={'ch-field__help' + (error ? ' is-error' : '')} role={error ? 'alert' : undefined} data-ch-code={error?.code}>
          {error?.text || help}
        </span>
      )}
    </div>
  );
}

export interface SaveBarProps {
  dirty: boolean;
  pending: boolean;
  invalid?: ChProblem | null;
  onSave: () => void;
  onReset?: () => void;
  label?: string;
  /** When the last save landed (useDraft), 0 before any. */
  savedAt: number;
  /** Enter in a text field saves: only for a card whose one job is that send (the email change, asking to join). */
  enterSaves?: boolean;
}

/**
 * The inline save bar of an edit card. It is there only while the card has something to save: "Unsaved changes" with
 * Discard and Save changes, then "Saving…" on the busy button, then a quiet "Saved" that holds the bar for 1.8s and
 * lets it go. The bar keeps one height through all three, so the check arriving moves nothing; it rises with the
 * fields' own beat and sits at the foot of the screen while the card is taller than the view.
 */
export function SaveBar({ dirty, pending, invalid, onSave, onReset, label = 'Save changes', savedAt }: SaveBarProps) {
  const reduced = useChReducedMotion();
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (!savedAt) return;
    setFlash(true);
    const t = window.setTimeout(() => setFlash(false), 1800);
    return () => window.clearTimeout(t);
  }, [savedAt]);
  const open = dirty || pending || flash;
  const editing = dirty || pending;
  return (
    <AnimatePresence initial={false}>
      {open && (
        <m.div
          key="bar"
          className="ch-set-savebar"
          role="group"
          aria-label="Save changes"
          initial={reduced ? false : { opacity: 0, transform: 'translateY(6px)' }}
          animate={{ opacity: 1, transform: 'translateY(0px)' }}
          exit={{ opacity: 0 }}
          transition={chTween('quick', reduced)}
        >
          {/* CH-8602: "Unsaved changes" becomes "Saved" with a check that settles after 1.8s; CH-8803: it is announced. */}
          <span className="ch-set-status" aria-live="polite" data-ch-code={pending ? 'CH-8402' : undefined}>
            {invalid && dirty ? (
              <span className="is-invalid" data-ch-code={invalid.code}>
                {invalid.text}
              </span>
            ) : dirty ? (
              <span>
                <i className="ch-set-dot" aria-hidden />
                Unsaved changes
              </span>
            ) : flash && !pending ? (
              <span className="is-saved">
                <Icon icon={Check} size={14} />
                Saved
              </span>
            ) : null}
          </span>
          {editing && (
            <span className="ch-set-savebar__acts">
              {onReset && !pending && (
                <Button variant="ghost" size="sm" feel="warning" onClick={onReset}>
                  Discard
                </Button>
              )}
              <Button variant="primary" size="sm" busy={pending} disabled={!!invalid} onClick={onSave}>
                {pending ? 'Saving…' : label}
              </Button>
            </span>
          )}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A section whose read failed: says so, keeps the form away, offers a reload. With `title` it keeps the section's own
 * heading and caption, so the page reads the same with the notice where the rows would be (states audit c13). `bare`
 * is the notice alone, for a phone group that already carries the heading. `covered`: the section's ReadsFailed notice
 * carries the one Try again, so only the title stays here.
 */
export function ReadFailed({
  what,
  onRetry,
  code,
  title,
  description,
  bare = false,
  covered = false,
}: {
  what: string;
  onRetry: () => void;
  code: string;
  title?: string;
  description?: ReactNode;
  bare?: boolean;
  covered?: boolean;
}) {
  const notice = <InlineNotice code={code} title={`${what} didn’t load`} body="Nothing was changed. Reload to try again; the error has been reported." onRetry={onRetry} covered={covered} />;
  if (bare) return notice;
  if (title) {
    return (
      <Card title={title} description={description}>
        {notice}
      </Card>
    );
  }
  return <div className="ch-surface ch-set-failed">{notice}</div>;
}

/**
 * The reads of one section that failed, by name ("team details"), from `[failed, name]` pairs. With two or more the
 * section says so once at its top with one Try again (ReadsFailed, the shell's CH-1209), and each part's ReadFailed is
 * `covered` (states audit b6). One failure keeps its own notice and Try again.
 */
export function failedReads(reads: ReadonlyArray<readonly [boolean | undefined, string]>): string[] {
  return reads.filter(([failed]) => !!failed).map(([, name]) => name);
}

/** The section-level notice for two or more failed reads (renders nothing below two). */
export function ReadsFailed({ parts, onRetry }: { parts: readonly string[]; onRetry: () => void }) {
  return <PageNotice parts={parts} onRetry={onRetry} />;
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
      description="Your changes on this page haven’t been saved."
      footer={
        <>
          <Button variant="secondary" onClick={() => setPendingHref(null)}>
            Keep editing
          </Button>
          <Button
            variant="danger"
            feel="warning"
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

/** A refusal the server gave no plain reason for (a constraint, a PostgREST code): still not the connection. */
export const REFUSED_BODY = 'The server didn’t accept the change. The error has been reported.';
const CONNECTION_BODY = 'Check your connection and try again.';

/**
 * What the toast under a failed settings save says (VERIFY 2026-10-02, fixed 2026-10-17). Only a save that never got an
 * answer (a throw, no reason at all, or the browser's own network wording) is told to check the connection. A save the
 * server refused says why in plain words: a policy or a missing grant ("violates row-level security", "permission
 * denied", 42501, which friendlyReason drops as technical) is the access line friendlyReason already gives "permission";
 * an expired token is the session line; a short server sentence passes through; anything else technical is
 * REFUSED_BODY. `hint` is the card's own next step, which a refusal with no plain reason keeps.
 */
export function saveFailureBody(error: string | undefined, hint?: string): string {
  const e = error?.trim();
  if (!e || e === 'failed' || isRawBrowserFailure(e)) return hint ?? CONNECTION_BODY;
  if (/row[- ]level security|permission denied|insufficient privilege|\b42501\b/i.test(e)) return 'Your account doesn’t have access to do this.';
  if (/\bJWT\b|PGRST30[13]/i.test(e)) return 'Your session ended. Sign in again, then retry.';
  return friendlyReason(e) ?? hint ?? REFUSED_BODY;
}

/** useAction's `refine` for a settings save: the failure body by cause (saveFailureBody), shown as written. */
export function refineSaveFailure<T>(result: ActionResult<T>, copy: ActionCopy): ActionCopy {
  return result.success ? copy : { ...copy, hint: saveFailureBody(result.error, copy.hint) };
}

/**
 * useAction for a save whose landing finishes the card: commit the draft, clear
 * the fields, close the dialog, ask for a fresh read. That work runs inside the
 * action, so it happens when the toast's Retry lands the save too (the toast
 * re-runs the action, not the button's handler).
 */
export function useSaveAction<A extends unknown[], T>(
  name: string,
  write: (...a: A) => Promise<ChResult<T>>,
  copy: ActionCopy | ((...a: A) => ActionCopy),
  landed: (r: ChResult<T>, ...a: A) => void,
) {
  return useAction(
    name,
    async (...a: A) => {
      const r = await write(...a);
      if (r.success || r.ok) landed(r, ...a);
      return r;
    },
    copy,
    refineSaveFailure,
  );
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
    // `v` is what was sent. The draft is left as it is: when it still equals `v` it is clean, and when the person
    // kept typing during a slow save, or before a Retry landed, that typing stays and shows as unsaved (81205).
    commit: (v: T = draft) => {
      setBase(v);
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

/**
 * The keys of settings that saved a moment ago (1.8s), for the quiet "Saved" by their row (SavedMark). A key saved
 * again before its time restarts it; the timers go with the section.
 */
export function useSavedKeys() {
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef(new Map<string, number>());
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach((id) => window.clearTimeout(id));
  }, []);
  const mark = (...keys: string[]) => {
    setSaved((s) => new Set([...s, ...keys]));
    for (const key of keys) {
      window.clearTimeout(timers.current.get(key));
      timers.current.set(
        key,
        window.setTimeout(() => {
          timers.current.delete(key);
          setSaved((s) => {
            const n = new Set(s);
            n.delete(key);
            return n;
          });
        }, 1800),
      );
    }
  };
  /** Any of these just saved (a card-level mark for a group of controls). */
  const any = (...keys: string[]) => keys.some((k) => saved.has(k));
  return { saved, mark, any };
}

export function useInstantSave(surface: string) {
  const toast = useToast();
  const delayedToast = useDelayedToast();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const { saved, mark } = useSavedKeys();
  const run = async (op: InstantSave): Promise<boolean> => {
    if (isOffline()) {
      // CH-1903: refuse at once while offline, instead of flipping and flipping back.
      haptic('error');
      toast({ tone: 'error', title: `${op.failed}: you’re offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
      return false;
    }
    op.apply();
    setPending((s) => new Set(s).add(op.key));
    chTrail(`settings ${surface} ${op.key}`);
    const stopSlow = delayedToast({ title: 'Still saving…', body: 'This is taking longer than usual. Keep this page open.', code: 'CH-1902' }, CH_SLOW_SAVE_AFTER);
    let r: ChResult;
    try {
      r = await op.write();
    } catch (err) {
      chReport(err, { surface: `settings.${surface}`, action: op.key });
      r = { success: false };
    } finally {
      stopSlow();
    }
    setPending((s) => {
      const n = new Set(s);
      n.delete(op.key);
      return n;
    });
    // The control already ticked when it changed (D-70); a save that lands is silent, and says Saved by its row.
    if (r.success || r.ok) {
      mark(op.key);
      return true;
    }
    op.rollback();
    haptic('error');
    if (r.error) chReport(new Error(r.error), { surface: `settings.${surface}`, action: op.key, severity: 'low' });
    toast({
      tone: 'error',
      title: op.failed,
      // A refusal says why; only a save that got no answer is told to check the connection.
      body: `It is back where it was. ${saveFailureBody(r.error)}`,
      action: { label: 'Retry', run: () => void run(op) },
      code: op.code,
    });
    return false;
  };
  return { run, pending, saved };
}

/**
 * A settings switch: while its save is in flight it carries CH-8403 (holds its position, can't flip again). CH-8603: the
 * thumb slides with a small spring; CH-8802: it has a name a screen reader reads.
 */
export function SettingSwitch(props: React.ComponentProps<typeof Switch>) {
  return <Switch {...props} busyCode="CH-8403" />;
}

/**
 * The warning tick as a confirm for something that cannot be taken back opens (D-70: warning before Remove, Delete,
 * Discard): Leave team, Make a new code, Reset CoachHelm updates and Turn off CoachHelm on the desktop; the phone's
 * action sheets already give it (readiness audit, 2026-10-17).
 */
export function useWarnOnOpen(open: boolean): void {
  useEffect(() => {
    if (open) haptic('warning');
  }, [open]);
}
