'use client';

/**
 * FairwayRecruitFormSheet — create/edit a recruiting prospect.
 *
 * Sheet-hosted form (Fairway overlays/Sheet + forms primitives). Mirrors the
 * legacy RecruitFormSheet's fields and write path
 * (createRecruit / updateRecruit / deleteRecruit, imported VERBATIM by exact
 * path) but restyled with Fairway primitives. Faithful reproductions:
 *   • two-step inline Remove → Confirm delete (edit mode only)
 *   • uppercased, 2-char-clamped `state` field
 *   • `hs_class` coerced to `number | null`
 *   • required first name, per-field length limits (matching the server)
 * No fetch added, no action changed, no schema change.
 */

import * as React from 'react';
import { Trash2 } from 'lucide-react';

import { useMediaQuery } from '@/hooks/use-media-query';
import { Sheet } from '@/components/fairway/overlays/Sheet';
import { Button } from '@/components/fairway/controls/button';
import { FilterPill } from '@/components/fairway/controls/filter-pill';
import { Form } from '@/components/fairway/forms/Form';
import { FormField } from '@/components/fairway/forms/FormField';
import { Input, TextArea } from '@/components/fairway/forms/Input';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';

import {
  createRecruit,
  updateRecruit,
  deleteRecruit,
  type Recruit,
  type RecruitInput,
  type RecruitStatus,
} from '@/app/golf/actions/recruiting';
import { RECRUIT_STATUS_META } from './recruit-status';
import { FairwayRecruitDocuments } from './FairwayRecruitDocuments';

// Aligned to the server bound (recruiting.ts MIN/MAX_HS_CLASS = 2020–2040).
// The legacy form used a tighter 2024–2032 window; per the redesign plan the
// rebuild aligns the form toward the server bound to remove the mismatch.
const MIN_HS_CLASS = 2020;
const MAX_HS_CLASS = 2040;

const EMPTY_FORM: RecruitInput = {
  first_name: '',
  last_name: '',
  hs_class: null,
  email: '',
  phone: '',
  hometown: '',
  state: '',
  notes: '',
  status: 'recruiting',
};

export interface FairwayRecruitFormSheetProps {
  open: boolean;
  recruit: Recruit | null; // null = create mode
  onClose: () => void;
  onSaved: () => void;
}

export function FairwayRecruitFormSheet({
  open,
  recruit,
  onClose,
  onSaved,
}: FairwayRecruitFormSheetProps) {
  const isEditing = recruit !== null;
  const [form, setForm] = React.useState<RecruitInput>(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    if (recruit) {
      setForm({
        first_name: recruit.first_name,
        last_name: recruit.last_name ?? '',
        hs_class: recruit.hs_class,
        email: recruit.email ?? '',
        phone: recruit.phone ?? '',
        hometown: recruit.hometown ?? '',
        state: recruit.state ?? '',
        notes: recruit.notes ?? '',
        status: recruit.status,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setConfirmingDelete(false);
  }, [open, recruit]);

  const set = <K extends keyof RecruitInput>(key: K, value: RecruitInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!form.first_name?.trim()) {
      fairwayToast.error('First name required', {
        description: 'Add a first name to save this prospect.',
      });
      return;
    }
    setSaving(true);
    try {
      if (isEditing && recruit) {
        const res = await updateRecruit(recruit.id, form);
        if (!res.success) throw new Error(res.error);
        fairwayToast.success('Saved', { description: `${form.first_name}'s record was updated.` });
      } else {
        const res = await createRecruit(form);
        if (!res.success) throw new Error(res.error);
        fairwayToast.success('Added', { description: `${form.first_name} is now on your prospect list.` });
      }
      onSaved();
      onClose();
    } catch (err) {
      fairwayToast.error('Save failed', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!recruit) return;
    setSaving(true);
    try {
      const res = await deleteRecruit(recruit.id);
      if (!res.success) throw new Error(res.error);
      fairwayToast.success('Removed', { description: `${recruit.first_name} was removed from your list.` });
      onSaved();
      onClose();
    } catch (err) {
      fairwayToast.error('Remove failed', {
        description: err instanceof Error ? err.message : 'Try again in a moment.',
      });
    } finally {
      setSaving(false);
    }
  };

  const canSave = Boolean(form.first_name?.trim()) && !saving;

  // Doctrine rule 4: create/edit flows are a bottom sheet under `md` — the
  // desktop-only docked side="right" panel is what was rendering
  // centered/clipped on phone (same defect as FairwayNewMessageSheet).
  const isDesktop = useMediaQuery('(min-width: 768px)');

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onClose();
      }}
      side={isDesktop ? 'right' : 'bottom'}
      title={isEditing ? 'Edit prospect' : 'Add to Recruiting HQ'}
      description={
        isEditing ? 'Update this prospect’s record.' : 'Add a high-school golfer you’re tracking.'
      }
    >
      <Sheet.Body>
        <Form
          spacing="cozy"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSave();
          }}
        >
          {/* Status picker */}
          <FormField label="Status">
            <div className="flex flex-wrap gap-2">
              {RECRUIT_STATUS_META.map((s) => (
                <FilterPill
                  key={s.value}
                  size="sm"
                  selected={form.status === s.value}
                  onClick={() => set('status', s.value as RecruitStatus)}
                  disabled={saving}
                >
                  {s.label}
                </FilterPill>
              ))}
            </div>
          </FormField>

          {/* Name row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" required>
              <Input
                value={form.first_name ?? ''}
                onChange={(e) => set('first_name', e.target.value)}
                disabled={saving}
                maxLength={120}
                placeholder="Jordan"
              />
            </FormField>
            <FormField label="Last name" showOptional>
              <Input
                value={form.last_name ?? ''}
                onChange={(e) => set('last_name', e.target.value)}
                disabled={saving}
                maxLength={120}
                placeholder="Spieth"
              />
            </FormField>
          </div>

          {/* HS class + hometown + state */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="HS Class">
              {/* Native number input mirrors the legacy form's `<input
                  type="number">` exactly: coerce to `number | null`, clamp via
                  the server-aligned 2020–2040 bound. Fragment Mono tabular. */}
              <Input
                type="number"
                inputMode="numeric"
                value={form.hs_class ?? ''}
                onChange={(e) => set('hs_class', e.target.value ? Number(e.target.value) : null)}
                min={MIN_HS_CLASS}
                max={MAX_HS_CLASS}
                disabled={saving}
                placeholder="2027"
                className="font-fw-mono tabular-nums"
              />
            </FormField>
            <FormField label="Hometown">
              <Input
                value={form.hometown ?? ''}
                onChange={(e) => set('hometown', e.target.value)}
                disabled={saving}
                maxLength={120}
                placeholder="Dallas"
              />
            </FormField>
            <FormField label="State">
              <Input
                value={form.state ?? ''}
                onChange={(e) => set('state', e.target.value.toUpperCase().slice(0, 2))}
                disabled={saving}
                maxLength={2}
                placeholder="TX"
                className="uppercase"
              />
            </FormField>
          </div>

          {/* Contact row */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Email" showOptional>
              <Input
                type="email"
                value={form.email ?? ''}
                onChange={(e) => set('email', e.target.value)}
                disabled={saving}
                maxLength={254}
                placeholder="player@school.edu"
              />
            </FormField>
            <FormField label="Phone" showOptional>
              <Input
                type="tel"
                value={form.phone ?? ''}
                onChange={(e) => set('phone', e.target.value)}
                disabled={saving}
                maxLength={40}
                placeholder="(555) 123-4567"
              />
            </FormField>
          </div>

          {/* Notes */}
          <FormField label="Notes" showOptional>
            <TextArea
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              disabled={saving}
              rows={4}
              maxLength={5000}
              placeholder="Tournament results, coach contact, scholarship offers, anything worth remembering…"
            />
          </FormField>
        </Form>

        {/* Per-recruit documents (edit mode only — uploads need a saved recruit id) */}
        {isEditing && recruit ? (
          <div className="mt-5">
            <FairwayRecruitDocuments recruitId={recruit.id} />
          </div>
        ) : null}
      </Sheet.Body>

      <Sheet.Footer className="justify-between">
        {/* Two-step Remove → Confirm (edit mode only) */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            confirmingDelete ? (
              <>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={saving}>
                  Confirm remove
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
                className="text-fw-danger hover:bg-fw-danger-bg"
              >
                Remove
              </Button>
            )
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" busy={saving} onClick={handleSave} disabled={!canSave}>
            {isEditing ? 'Save changes' : 'Add prospect'}
          </Button>
        </div>
      </Sheet.Footer>
    </Sheet>
  );
}

export default FairwayRecruitFormSheet;
