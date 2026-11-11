'use client';

import { Plus, TriangleAlert, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, IconButton } from '../../../../ui/Button';
import { Checkbox } from '../../../../ui/Checkbox';
import { DateField } from '../../../../ui/DateField';
import { Icon } from '../../../../ui/Icon';
import { Segmented } from '../../../../ui/Segmented';
import { Select } from '../../../../ui/Select';
import { Switch } from '../../../../ui/Switch';
import { TimeField } from '../../../../ui/TimeField';
import type { EditableField } from './types';

/**
 * Edit mode of a task card (CAPABILITIES.md 0.8). Only the fields the plan declares appear, each in the app's own
 * control for that kind of value: a day in the date field, a time in the time field, people as the roster's checkboxes,
 * a choice as the segmented control or the select, a switch for a yes or no. Nothing here writes: the form hands back
 * the fields that changed, the shell sends them, and the server's re-planned card replaces this one. Until that card
 * arrives the plan above the form is still the one that would be confirmed, which is why the shell holds Confirm.
 */

type Value = EditableField['value'];
const same = (a: Value, b: Value): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const empty = (v: Value): boolean => v == null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);
const count = (n: number): string => n.toLocaleString('en-US');

/** An ISO instant as the day and the time on the viewer's own clock, and back. */
function instantParts(iso: string | null): { date: string; time: string } {
  const at = iso ? new Date(iso) : null;
  if (!at || Number.isNaN(at.getTime())) return { date: '', time: '' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, time: `${pad(at.getHours())}:${pad(at.getMinutes())}` };
}
function instantOf(date: string, time: string): string | null {
  if (!date) return null;
  const at = new Date(`${date}T${time || '00:00'}:00`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

function Field({ field, value, disabled, onChange }: { field: EditableField; value: Value; disabled: boolean; onChange: (next: Value) => void }) {
  const id = useId();
  const label = (
    <span className="ch-field__label">
      {field.label}
      {!field.required && <span className="ch-field__opt">Optional</span>}
    </span>
  );
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  switch (field.type) {
    case 'text':
      return (
        <label className="ch-field">
          {label}
          <input className="ch-input" value={text} maxLength={field.max_length} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
        </label>
      );
    case 'long_text':
      return (
        <label className="ch-field">
          {label}
          <textarea className="ch-textarea" rows={4} value={text} maxLength={field.max_length} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
          {field.max_length && (
            <span className="ch-field__help ch-num">
              {count(text.length)} of {count(field.max_length)} characters
            </span>
          )}
        </label>
      );
    case 'number':
      return (
        <label className="ch-field">
          {label}
          <input className="ch-input ch-num" type="number" inputMode="decimal" value={text} min={field.min} max={field.max} step={field.step} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
        </label>
      );
    case 'date':
      return (
        <div className="ch-field">
          {label}
          <DateField label={field.label} value={text} clearable={!field.required} disabled={disabled} onChange={(v) => onChange(v || null)} />
        </div>
      );
    case 'time':
      return (
        <div className="ch-field">
          {label}
          <TimeField label={field.label} value={text} clearable={!field.required} disabled={disabled} onChange={(v) => onChange(v || null)} />
        </div>
      );
    case 'datetime': {
      const parts = instantParts(typeof value === 'string' ? value : null);
      return (
        <div className="ch-field">
          {label}
          <div className="ch-akc-edit__pair">
            <DateField label={`${field.label}, the day`} value={parts.date} clearable={!field.required} disabled={disabled} onChange={(d) => onChange(instantOf(d, parts.time))} />
            <TimeField label={`${field.label}, the time`} value={parts.time} disabled={disabled || !parts.date} onChange={(t) => onChange(instantOf(parts.date, t))} />
          </div>
        </div>
      );
    }
    case 'choice': {
      const options = field.options ?? [];
      return (
        <div className="ch-field">
          {label}
          {options.length <= 4 ? (
            <Segmented label={field.label} size="sm" value={text} options={options.map((o) => ({ value: o.value, label: o.label, disabled }))} onChange={(v) => onChange(v)} />
          ) : (
            <Select id={id} label={field.label} value={text} options={options} disabled={disabled} onChange={(v) => onChange(v)} />
          )}
        </div>
      );
    }
    case 'toggle':
      return (
        <div className="ch-akc-edit__toggle">
          <span className="ch-field__label">{field.label}</span>
          <Switch label={field.label} hideLabel checked={value === true} disabled={disabled} onChange={(v) => onChange(v)} />
        </div>
      );
    case 'people': {
      const chosen = Array.isArray(value) ? value : [];
      const options = field.options ?? [];
      const toggle = (v: string, on: boolean) => onChange(on ? options.map((o) => o.value).filter((x) => x === v || chosen.includes(x)) : chosen.filter((x) => x !== v));
      return (
        <fieldset className="ch-field ch-akc-edit__people" disabled={disabled}>
          <legend className="ch-field__label">
            {field.label}
            <span className="ch-field__opt ch-num">
              {count(chosen.length)} of {count(options.length)}
            </span>
          </legend>
          <div>
            {options.map((o) => (
              <Checkbox key={o.value} checked={chosen.includes(o.value)} disabled={disabled} onChange={(on) => toggle(o.value, on)}>
                {o.label}
              </Checkbox>
            ))}
          </div>
        </fieldset>
      );
    }
    case 'list': {
      const items = Array.isArray(value) ? value : [];
      const full = field.max_items != null && items.length >= field.max_items;
      return (
        <fieldset className="ch-field ch-akc-edit__list" disabled={disabled}>
          <legend className="ch-field__label">{field.label}</legend>
          {items.map((item, i) => (
            // The row's place is its identity: two items may hold the same words.
            <div key={i} className="ch-akc-edit__item">
              <input className="ch-input" aria-label={`${field.label}, ${i + 1}`} value={item} maxLength={field.max_length} disabled={disabled} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
              <IconButton icon={X} label={`Remove ${item || `item ${i + 1}`}`} size="sm" disabled={disabled} onClick={() => onChange(items.filter((_, j) => j !== i))} />
            </div>
          ))}
          {!full && (
            <Button variant="ghost" size="sm" leftIcon={Plus} disabled={disabled} onClick={() => onChange([...items, ''])}>
              Add one
            </Button>
          )}
        </fieldset>
      );
    }
  }
}

/** Why the form cannot be sent yet, in the field's own words; null when it can. */
function blocked(fields: readonly EditableField[], values: Record<string, Value>): string | null {
  for (const f of fields) {
    const v = values[f.key] ?? null;
    if (f.required && empty(v)) return `${f.label} cannot be empty.`;
    if (Array.isArray(v)) {
      if (f.min_items != null && v.length < f.min_items) return `${f.label} needs at least ${f.min_items}.`;
      if (f.max_items != null && v.length > f.max_items) return `${f.label} takes at most ${f.max_items}.`;
    }
    if (typeof v === 'string' && f.min_length != null && v.length > 0 && v.length < f.min_length) return `${f.label} is too short.`;
  }
  return null;
}

export function EditForm({ fields, busy, error, onSubmit, onClose }: { fields: readonly EditableField[]; busy: boolean; error: string | null; /** Only the fields that changed; an optional field that was emptied is sent as null. */ onSubmit: (patch: Record<string, unknown>) => void; onClose: () => void }) {
  const [values, setValues] = useState<Record<string, Value>>(() => Object.fromEntries(fields.map((f) => [f.key, f.value])));
  const patch = Object.fromEntries(
    fields.flatMap((f) => {
      const raw = values[f.key] ?? null;
      const next = Array.isArray(raw) ? raw.map((x) => x.trim()).filter(Boolean) : typeof raw === 'string' ? raw.trim() || null : raw;
      return same(next, f.value) || (empty(next) && empty(f.value)) ? [] : [[f.key, next] as const];
    }),
  );
  const changed = Object.keys(patch).length;
  const why = blocked(fields, values);
  return (
    <form
      className="ch-akc-edit"
      aria-label="Change this card"
      aria-busy={busy}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && changed > 0 && !why) onSubmit(patch);
      }}
    >
      <p className="ch-akc-edit__lede">Change what you need. The card above is still the one that would be confirmed until you update it.</p>
      {fields.map((f) => (
        <Field key={f.key} field={f} value={values[f.key] ?? null} disabled={busy} onChange={(next) => setValues((all) => ({ ...all, [f.key]: next }))} />
      ))}
      {error && (
        <p className="ch-akc-warn" role="alert">
          <Icon icon={TriangleAlert} size={15} />
          <span>
            {error} <b>The card has not changed.</b>
          </span>
        </p>
      )}
      {!error && why && changed > 0 && <p className="ch-field__help">{why}</p>}
      <div className="ch-akc-edit__keys">
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          {changed > 0 ? 'Discard changes' : 'Close'}
        </Button>
        <Button variant="secondary" size="sm" type="submit" busy={busy} disabled={!busy && (changed === 0 || !!why)}>
          {busy ? 'Updating the preview…' : 'Update the preview'}
        </Button>
      </div>
      <p className="ch-akc-edit__fixed">Everything else on this card is fixed. To change it, ask in words and a new card replaces this one.</p>
    </form>
  );
}
