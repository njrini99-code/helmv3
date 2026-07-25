'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2, GitPullRequest, ImageUp, Send } from 'lucide-react';
import { Button, StatusPill } from '@/components/fairway';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { submitBenLeahFeedback, type BenLeahSubmitState } from './actions';

const initialState: BenLeahSubmitState = { ok: false, message: '' };

// Mobile Doctrine (no zoom-on-focus): every field sharing this class was
// pinned to a flat `text-sm` (14px) at all breakpoints, which overrode the
// Input/Textarea/NativeSelect components' own iOS-safe `text-base` mobile
// tier (twMerge keeps the LAST conflicting class, and this className is
// always passed last) — every text entry field on the ONE Bridge surface a
// non-technical phone user touches was silently forcing Safari's
// zoom-on-focus. `text-base md:text-sm` restores 16px below `md` and keeps
// the original 14px density at `md`+. `min-h-[48px]` gives NativeSelect the
// same touch target Input already had (its own default has no min-height).
const fieldClass = cn(
  'w-full min-h-[48px] rounded-fw-md border border-border-subtle bg-surface px-3 py-2 text-base md:text-sm text-warm-900 shadow-flat outline-none',
  'placeholder:text-warm-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20',
);

const textareaClass = cn(fieldClass, 'min-h-28 resize-y leading-6');

function SubmitButton({ className, fullWidth }: { className?: string; fullWidth?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="md"
      busy={pending}
      fullWidth={fullWidth}
      leftIcon={<Send size={16} aria-hidden />}
      className={className}
    >
      {pending ? 'Submitting' : 'Submit to GitHub'}
    </Button>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-widest text-warm-500">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint ? <span className="mt-1 block text-xs text-warm-500">{hint}</span> : null}
    </label>
  );
}

export function BenLeahForm() {
  const [state, formAction] = useActionState(submitBenLeahFeedback, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // REPAIR (verified defect, see docs/MOBILE_DOCTRINE.md rule 5): the fixed
  // CTA bar below is `position: fixed`, which anchors to the viewport, not
  // to this form's own scroll extent (confirmed no transform/filter/
  // will-change/contain ancestor breaks that — admin/template.tsx is
  // opacity-only specifically to avoid creating one). Rendering it
  // unconditionally meant it stayed on screen for the ENTIRE page scroll —
  // including while the user scrolled through the unrelated aside cards and
  // the "Issue tracker" panel far below this form, permanently covering the
  // tail of that content. An IntersectionObserver on the form scopes the
  // bar's screen-time to the form's OWN presence: visible while any part of
  // the form is on screen (so it tracks through every field), gone once the
  // user has scrolled past the whole form into content this bar has nothing
  // to do with. Default state is `true` so SSR output and first client paint
  // match (no hydration mismatch) before the observer's first callback.
  const [ctaInView, setCtaInView] = useState(true);

  useEffect(() => {
    const node = formRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaInView(entry?.isIntersecting ?? true),
      { threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <form
      ref={formRef}
      action={formAction}
      encType="multipart/form-data"
      // Rule 5 (docs/MOBILE_DOCTRINE.md) — the fixed mobile CTA bar below
      // docks over the tail of the form, so the scroll area reserves space
      // for it (bar + Bridge's fixed bottom-tab bar) below `md`; desktop
      // keeps the inline button in flow, so no reserve is needed there.
      className="space-y-5 pb-28 md:pb-0"
    >
      <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)_220px]">
        <Field label="Request type">
          <NativeSelect name="kind" required className={fieldClass} defaultValue="bug">
            <option value="bug">Bug</option>
            <option value="change">Change</option>
            <option value="addition">Addition</option>
          </NativeSelect>
        </Field>
        <Field label="Title">
          <Input name="title" required minLength={8} maxLength={180} className={fieldClass} placeholder="Short, specific title" />
        </Field>
        <Field label="Priority">
          <NativeSelect name="priority" required className={fieldClass} defaultValue="normal">
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </NativeSelect>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Reporter">
          <NativeSelect name="reporter" required className={fieldClass} defaultValue="Ben + Leah">
            <option value="Ben + Leah">Ben + Leah</option>
            <option value="Ben">Ben</option>
            <option value="Leah">Leah</option>
          </NativeSelect>
        </Field>
        <Field label="Category">
          <NativeSelect name="category" required className={fieldClass} defaultValue="BaseballHelm">
            <option value="BaseballHelm">BaseballHelm</option>
            <option value="GolfHelm">GolfHelm</option>
            <option value="CoachHelm">CoachHelm</option>
            <option value="Helm Bridge">Helm Bridge</option>
            <option value="Auth">Auth</option>
            <option value="Data">Data</option>
            <option value="UI UX">UI UX</option>
            <option value="Performance">Performance</option>
            <option value="Other">Other</option>
          </NativeSelect>
        </Field>
        <Field label="Screenshots">
          <span className="flex min-h-[48px] items-center gap-2 rounded-fw-md border border-dashed border-border-strong bg-surface px-3 py-2 text-sm text-warm-600">
            <ImageUp size={16} aria-hidden />
            <Input
              name="screenshots"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="min-w-0 flex-1 text-xs file:mr-3 file:rounded-full file:border-0 file:bg-surface-sunken file:px-3 file:py-1 file:text-xs file:font-medium file:text-warm-700"
            />
          </span>
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Page URL" hint="Where they noticed it, if there is a specific page.">
          <Input name="pageUrl" type="url" className={fieldClass} placeholder="https://helmsportslabs.com/..." />
        </Field>
        <Field label="Signal URL" hint="Optional Sentry, Vercel, customer note, Slack link, or source signal.">
          <Input name="signalUrl" type="url" className={fieldClass} placeholder="https://..." />
        </Field>
      </div>

      <Field label="Detailed summary" hint="The more exact this is, the faster it can become an issue someone can fix.">
        <Textarea
          name="summary"
          required
          minLength={30}
          maxLength={8000}
          className={textareaClass}
          placeholder="What happened, what should change, who it affects, and why it matters."
        />
      </Field>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Expected">
          <Textarea name="expected" maxLength={4000} className={textareaClass} placeholder="What should happen?" />
        </Field>
        <Field label="Actual">
          <Textarea name="actual" maxLength={4000} className={textareaClass} placeholder="What happened instead?" />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Steps or context">
          <Textarea name="steps" maxLength={8000} className={textareaClass} placeholder="Steps to reproduce, account/team/player, device, browser, timing." />
        </Field>
        <Field label="Impact">
          <Textarea name="impact" maxLength={4000} className={textareaClass} placeholder="How bad is it, who is blocked, and what decision does it affect?" />
        </Field>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-warm-200 pt-4">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="accent" size="sm" dot={false}>
            GitHub issue
          </StatusPill>
          <StatusPill tone="neutral" size="sm" dot={false}>
            Images optional
          </StatusPill>
          <StatusPill tone="neutral" size="sm" dot={false}>
            Signal URL optional
          </StatusPill>
        </div>
        {/* Desktop keeps the inline CTA; below `md` the primary action moves
            to the fixed thumb-zone bar (Rule 5) so it isn't duplicated on
            screen. */}
        <SubmitButton className="hidden md:inline-flex" />
      </div>

      {/* Rule 5 (docs/MOBILE_DOCTRINE.md) — thumb-zone commit: below `md` the
          primary action is reachable without scroll-to-save no matter which
          field is focused, docked just above Bridge's fixed bottom-tab bar
          (56px tall, see FairwayBottomNav, + the iOS home-indicator safe
          area). AdminTemplate is opacity-only specifically so `position:
          fixed` here stays anchored to the viewport, not a transformed
          ancestor (see admin/template.tsx). Gated on `ctaInView` (see the
          IntersectionObserver above) so it only occupies the viewport while
          this form is actually the thing on screen — it must not keep
          floating over the aside cards / issue tracker once the user has
          scrolled past the form. */}
      {ctaInView ? (
        <div
          className={cn(
            'fixed inset-x-0 z-[calc(var(--fw-z-nav)+1)] border-t border-warm-200 bg-surface/95 px-4 py-3 md:hidden',
            'bottom-[calc(56px+env(safe-area-inset-bottom,0px))]',
          )}
        >
          <SubmitButton fullWidth />
        </div>
      ) : null}

      {state.message ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-fw-md border px-3 py-2 text-sm',
            state.ok ? 'border-accent-500/35 bg-accent-50 text-accent-700' : 'border-fw-danger/35 bg-fw-danger-bg text-fw-danger-ink',
          )}
          role="status"
        >
          {state.ok ? <CheckCircle2 size={16} className="mt-0.5" aria-hidden /> : <AlertCircle size={16} className="mt-0.5" aria-hidden />}
          <span className="min-w-0 flex-1">
            {state.message}
            {state.issue ? (
              <a href={state.issue.html_url} className="ml-2 inline-flex items-center gap-1 underline" target="_blank" rel="noreferrer">
                <GitPullRequest size={14} aria-hidden />
                Open issue
              </a>
            ) : null}
          </span>
        </div>
      ) : null}
    </form>
  );
}
