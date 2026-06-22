'use client';

/**
 * CourseFormDrawer — create / edit a cloud course in a Vaul-backed sheet.
 *
 * One drawer, two modes. On mobile it's an iOS-grade bottom sheet (drag to
 * dismiss); on desktop it center-docks as a matte panel. Fields are the
 * facility-level course details only — tee sets and the hero image live in
 * their own surfaces. Optional fields submit as `null` (never `''`) so the
 * server action never persists empty strings as data.
 */

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { FormField } from '@/components/fairway/forms/FormField';
import { Button, IconButton } from '@/components/fairway/controls/button';
import { useToast } from '@/components/ui/sonner';
import { IconX } from '@/components/icons';
import { createCourse, updateCourse } from '@/app/golf/actions/course-library';
import type { GolfCourse } from '@/lib/types/golf-course';

export interface CourseFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  /** Required when mode === 'edit'. */
  course?: GolfCourse;
  onSaved?: (course: GolfCourse, deduped: boolean) => void;
}

interface FormState {
  name: string;
  city: string;
  state: string;
  country: string;
  address: string;
  website: string;
}

const EMPTY: FormState = {
  name: '',
  city: '',
  state: '',
  country: '',
  address: '',
  website: '',
};

const inputClasses =
  'w-full rounded-fw-sm border border-border-subtle bg-surface-sunken px-3 py-2.5 ' +
  'text-body text-text-primary placeholder:text-text-tertiary ' +
  'focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-500/30';

/** '' → null; otherwise the trimmed value. */
function nullable(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function CourseFormDrawer({
  open,
  onOpenChange,
  mode,
  course,
  onSaved,
}: CourseFormDrawerProps) {
  const { showToast } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // (Re)seed the form whenever the drawer opens — blank for create, hydrated
  // from `course` for edit. Keyed on course id + open so reopening discards
  // any half-typed edits from a previous session.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && course) {
      setForm({
        name: course.name ?? '',
        city: course.city ?? '',
        state: course.state ?? '',
        country: course.country ?? '',
        address: course.address ?? '',
        website: course.website ?? '',
      });
    } else {
      setForm(EMPTY);
    }
    setNameError(undefined);
  }, [open, mode, course?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setField =
    (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const { value } = e.target;
      setForm((prev) => ({ ...prev, [key]: value }));
      if (key === 'name' && nameError) setNameError(undefined);
    };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const name = form.name.trim();
    if (!name) {
      setNameError('Course name is required');
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'edit') {
        if (!course) {
          showToast('No course to edit', 'error');
          return;
        }
        const result = await updateCourse(course.id, {
          name,
          city: nullable(form.city),
          state: nullable(form.state),
          country: nullable(form.country),
          address: nullable(form.address),
          website: nullable(form.website),
        });
        if (!result.success) {
          showToast(result.error, 'error');
          return;
        }
        showToast('Course updated', 'success');
        onSaved?.(result.data, false);
        onOpenChange(false);
      } else {
        const result = await createCourse({
          name,
          city: nullable(form.city),
          state: nullable(form.state),
          country: nullable(form.country),
          address: nullable(form.address),
          website: nullable(form.website),
        });
        if (!result.success) {
          showToast(result.error, 'error');
          return;
        }
        if (result.data.deduped) {
          showToast('That course already exists — opened it', 'warning');
        } else {
          showToast('Course added', 'success');
        }
        onSaved?.(result.data.course, result.data.deduped);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = mode === 'edit' ? 'Edit course' : 'Add course';

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:mx-auto sm:max-w-lg sm:rounded-fw-lg">
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
            <DrawerTitle className="font-fw-display text-text-primary">
              {title}
            </DrawerTitle>
            <IconButton
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="-mr-2 -mt-1 shrink-0"
            >
              <IconX size={18} aria-hidden />
            </IconButton>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 pb-2">
            <div className="flex flex-col gap-1">
              <FormField label="Course name" required error={nameError}>
                {/* eslint-disable-next-line helm/no-raw-input -- field carries its own bordered surface class; FormField owns label + error wiring */}
                <input
                  type="text"
                  value={form.name}
                  onChange={setField('name')}
                  placeholder="e.g. Pinehurst No. 2"
                  autoComplete="off"
                  className={inputClasses}
                />
              </FormField>

              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                <FormField label="City">
                  {/* eslint-disable-next-line helm/no-raw-input -- field carries its own bordered surface class; FormField owns label + error wiring */}
                  <input
                    type="text"
                    value={form.city}
                    onChange={setField('city')}
                    placeholder="City"
                    autoComplete="off"
                    className={inputClasses}
                  />
                </FormField>

                <FormField label="State">
                  {/* eslint-disable-next-line helm/no-raw-input -- field carries its own bordered surface class; FormField owns label + error wiring */}
                  <input
                    type="text"
                    value={form.state}
                    onChange={setField('state')}
                    placeholder="State"
                    autoComplete="off"
                    className={inputClasses}
                  />
                </FormField>
              </div>

              <FormField label="Country" showOptional>
                {/* eslint-disable-next-line helm/no-raw-input -- field carries its own bordered surface class; FormField owns label + error wiring */}
                <input
                  type="text"
                  value={form.country}
                  onChange={setField('country')}
                  placeholder="Country"
                  autoComplete="off"
                  className={inputClasses}
                />
              </FormField>

              <FormField label="Address" showOptional>
                {/* eslint-disable-next-line helm/no-raw-input -- field carries its own bordered surface class; FormField owns label + error wiring */}
                <input
                  type="text"
                  value={form.address}
                  onChange={setField('address')}
                  placeholder="Street address"
                  autoComplete="off"
                  className={inputClasses}
                />
              </FormField>

              <FormField label="Website" showOptional>
                {/* eslint-disable-next-line helm/no-raw-input -- field carries its own bordered surface class; FormField owns label + error wiring */}
                <input
                  type="url"
                  value={form.website}
                  onChange={setField('website')}
                  placeholder="https://"
                  autoComplete="off"
                  className={inputClasses}
                />
              </FormField>
            </div>
          </div>

          {/* Footer */}
          <div
            className={cn(
              'mt-auto flex items-center justify-end gap-2 px-6 py-4',
              'border-t border-border-subtle',
            )}
          >
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" busy={isSubmitting}>
              {mode === 'edit' ? 'Save changes' : 'Add course'}
            </Button>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
