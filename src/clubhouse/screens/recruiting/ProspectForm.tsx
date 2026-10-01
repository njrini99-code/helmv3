'use client';

import { UserPlus, UserRoundPen } from 'lucide-react';
import { useEffect, useId, useState, type InputHTMLAttributes } from 'react';
import {
  CH_STAGES,
  checkDraft,
  draftOf,
  inputFromDraft,
  type ChDraft,
  type ChDraftField,
  type ChDraftProblem,
  type ChProspect,
  type ChStage,
} from '../../data/recruiting-shape';
import type { RecruitInput } from '@/app/golf/actions/recruiting';
import { haptic } from '../../lib/haptics';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { RecFormSheet } from './RecSheet';

/** The form that is open: a new prospect, or one being edited. `focus` is the field to start in (Add next to "No contact details yet"). `nonce` makes each opening a fresh form. */
export interface RecFormState {
  mode: 'add' | 'edit';
  prospect: ChProspect | null;
  focus?: ChDraftField;
  nonce: number;
}

const keyOf = (f: RecFormState | null) => (f ? `${f.mode}:${f.prospect?.id ?? ''}:${f.nonce}` : '');

/**
 * Add and edit, one form (AddProspect board on desktop, PhoneEdit on the phone). Only a first name is required.
 * A refusal is shown beside its field before anything is sent (CH-14101 to CH-14104), and a save that fails leaves
 * the form open with what was typed (CH-14910). The form closes from the save's own action once it has landed. Enter in a
 * field saves (CH-14913), and Esc closes the dialog.
 */
export function ProspectForm({
  form,
  phone,
  saving,
  onSave,
  onClose,
  onDelete,
}: {
  form: RecFormState | null;
  phone: boolean;
  saving: boolean;
  onSave: (input: RecruitInput, form: RecFormState) => void;
  onClose: () => void;
  onDelete: (p: ChProspect) => void;
}) {
  const uid = useId();
  const key = keyOf(form);
  const [held, setHeld] = useState<{ key: string; draft: ChDraft; problems: ChDraftProblem[] }>({ key: '', draft: draftOf(null), problems: [] });
  // Each opening starts from the prospect as it is now, and from nothing for a new one.
  if (form && held.key !== key) setHeld({ key, draft: draftOf(form.prospect), problems: [] });
  const { draft, problems } = held;
  const setDraft = (next: ChDraft) => setHeld((h) => ({ ...h, draft: next, problems: h.problems.length ? checkDraft(next) : [] }));

  // The field to start in: the one a shortcut named (Add beside "No notes yet"), else the first name. A phone editing a prospect
  // starts with no field, so the keyboard doesn't cover the sheet before anything is asked of it.
  useEffect(() => {
    const field = form?.focus ?? (phone && form?.mode === 'edit' ? null : 'first');
    if (!form || !field) return;
    const id = requestAnimationFrame(() => document.getElementById(`${uid}-${field}`)?.focus());
    return () => cancelAnimationFrame(id);
  }, [form, phone, uid]);

  const submit = () => {
    if (!form || saving) return;
    // CH-14804: each refusal is beside its field (role=alert, aria-invalid, described by it) and focus goes to the first.
    const found = checkDraft(draft);
    if (found.length) {
      haptic('warning');
      setHeld((h) => ({ ...h, problems: found }));
      requestAnimationFrame(() => document.getElementById(`${uid}-${found[0]!.field}`)?.focus());
      return;
    }
    onSave(inputFromDraft(draft), form);
  };

  const adding = form?.mode === 'add';
  const fields = (
    <>
      <div className="ch-rec-form__grid">
        <div className="ch-rec-form__grp">
          <Field uid={uid} name="first" label="First name" draft={draft} problems={problems} onChange={setDraft} autoComplete="off" />
          <Field uid={uid} name="last" label="Last name" draft={draft} problems={problems} onChange={setDraft} autoComplete="off" />
        </div>
        <div className="ch-rec-form__grp">
          <Field uid={uid} name="email" label="Email" draft={draft} problems={problems} onChange={setDraft} type="email" inputMode="email" placeholder="name@example.com" autoComplete="off" />
          <Field uid={uid} name="phone" label="Phone" draft={draft} problems={problems} onChange={setDraft} type="tel" inputMode="tel" placeholder="(555) 000-0000" autoComplete="off" />
        </div>
        <div className="ch-rec-form__grp">
          <Field uid={uid} name="hometown" label="Hometown" draft={draft} problems={problems} onChange={setDraft} placeholder="City" autoComplete="off" />
          <div className="ch-rec-form__pair">
            <Field uid={uid} name="state" label="State" draft={draft} problems={problems} onChange={setDraft} placeholder="NC" autoComplete="off" clean={(v) => v.toUpperCase().slice(0, 2)} />
            <Field uid={uid} name="classYear" label="Class of" draft={draft} problems={problems} onChange={setDraft} inputMode="numeric" placeholder="2028" autoComplete="off" clean={(v) => v.replace(/\D/g, '').slice(0, 4)} />
          </div>
        </div>
      </div>
      {(!phone || adding) && (
        <div className="ch-rec-field">
          <span className="ch-field__label">Stage</span>
          <Segmented<ChStage> label="Stage" value={draft.stage} onChange={(stage) => setDraft({ ...draft, stage })} options={CH_STAGES.map((s) => ({ value: s.value, label: s.label }))} />
        </div>
      )}
      <div className="ch-field ch-rec-f ch-rec-f--notes">
        <label htmlFor={`${uid}-notes`} className="ch-field__label">
          Notes
        </label>
        <textarea
          id={`${uid}-notes`}
          className="ch-textarea"
          rows={phone ? 4 : 3}
          placeholder="Where you saw them, what stood out, next steps"
          value={draft.notes}
          aria-invalid={problems.some((p) => p.field === 'notes') || undefined}
          aria-describedby={problems.some((p) => p.field === 'notes') ? `${uid}-notes-e` : undefined}
          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
        />
        <Problem id={`${uid}-notes-e`} problem={problems.find((p) => p.field === 'notes')} />
      </div>
      {phone && !adding && form?.prospect && (
        <button type="button" className="ch-rec-danger is-block" onClick={() => onDelete(form.prospect!)}>
          Delete prospect
        </button>
      )}
    </>
  );
  // The phone's sheet is itself the form (its Save is the submit button), so its body is a div: forms don't nest.
  const body = phone ? (
    <div className="ch-rec-form is-phone">{fields}</div>
  ) : (
    <form
      className="ch-rec-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {fields}
      {/* Enter in a field saves, through the same checks as the button. */}
      <button type="submit" hidden />
    </form>
  );

  if (phone) {
    return (
      <RecFormSheet open={!!form} onClose={onClose} title={adding ? 'New prospect' : 'Prospect'} actionLabel={adding ? 'Add' : 'Save'} onAction={submit} busy={saving}>
        {form && body}
      </RecFormSheet>
    );
  }
  return (
    <Modal
      open={!!form}
      onClose={() => !saving && onClose()}
      width={600}
      icon={adding ? UserPlus : UserRoundPen}
      title={adding ? 'Add prospect' : 'Edit prospect'}
      description={adding ? 'Only a first name is required. Everything else can wait.' : form?.prospect ? `Update what you know about ${form.prospect.firstName}.` : undefined}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={saving} feel="press" onClick={submit}>
            {saving ? <span data-ch-code="CH-14403">Saving</span> : adding ? 'Add prospect' : 'Save changes'}
          </Button>
        </>
      }
    >
      {form && body}
    </Modal>
  );
}

function Problem({ id, problem }: { id: string; problem?: ChDraftProblem }) {
  if (!problem) return null;
  return (
    <span id={id} className="ch-field__help is-error" role="alert" data-ch-code={problem.code}>
      {problem.message}
    </span>
  );
}

function Field({
  uid,
  name,
  label,
  draft,
  problems,
  onChange,
  clean,
  ...input
}: {
  uid: string;
  name: Exclude<ChDraftField, 'notes'>;
  label: string;
  draft: ChDraft;
  problems: ChDraftProblem[];
  onChange: (d: ChDraft) => void;
  /** Keeps the value in shape as it is typed (the state in capitals, the year in digits). */
  clean?: (v: string) => string;
} & Pick<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'placeholder' | 'autoComplete'>) {
  const problem = problems.find((p) => p.field === name);
  return (
    <div className="ch-field ch-rec-f">
      <label htmlFor={`${uid}-${name}`} className="ch-field__label">
        {label}
      </label>
      <input
        id={`${uid}-${name}`}
        className="ch-input"
        value={draft[name]}
        aria-invalid={!!problem || undefined}
        aria-describedby={problem ? `${uid}-${name}-e` : undefined}
        onChange={(e) => onChange({ ...draft, [name]: clean ? clean(e.target.value) : e.target.value })}
        {...input}
      />
      <Problem id={`${uid}-${name}-e`} problem={problem} />
    </div>
  );
}
