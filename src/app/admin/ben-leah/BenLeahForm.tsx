'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { AlertCircle, CheckCircle2, GitPullRequest, ImageUp, Send } from 'lucide-react';
import { Button, StatusPill } from '@/components/fairway';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { submitBenLeahFeedback, type BenLeahSubmitState } from './actions';

const initialState: BenLeahSubmitState = { ok: false, message: '' };

const fieldClass = cn(
  'w-full rounded-fw-md border border-border-subtle bg-surface px-3 py-2 text-sm text-warm-900 shadow-flat outline-none',
  'placeholder:text-warm-400 focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20',
);

const textareaClass = cn(fieldClass, 'min-h-28 resize-y leading-6');

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" busy={pending} leftIcon={<Send size={16} aria-hidden />}>
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

  return (
    <form action={formAction} encType="multipart/form-data" className="space-y-5">
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
          <span className="flex min-h-[42px] items-center gap-2 rounded-fw-md border border-dashed border-border-strong bg-surface px-3 py-2 text-sm text-warm-600">
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
        <SubmitButton />
      </div>

      {state.message ? (
        <div
          className={cn(
            'flex items-start gap-2 rounded-fw-md border px-3 py-2 text-sm',
            state.ok ? 'border-accent-500/35 bg-accent-50 text-accent-700' : 'border-fw-danger/35 bg-fw-danger-bg text-fw-danger',
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
