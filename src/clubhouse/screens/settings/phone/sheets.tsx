'use client';

import { Check } from 'lucide-react';
import { useId } from 'react';
import { Icon } from '../../../ui/Icon';
import { haptic } from '../../../lib/haptics';
import { FormSheet as SheetBase, ListSheet, type FormSheetProps } from '../../../ui/FormSheet';
import { useReportDirty } from '../parts';

/**
 * The phone's sheets (docs/clubhouse/phone/settings.md) are the shared ones (ui/FormSheet.tsx, CONS-23): Cancel, a
 * title and Save; a title and Done; an iOS action sheet with the destructive choice in red. Settings adds the page's
 * unsaved-edit guard to its edit sheets, and a picker made of its own rows.
 */
export { ActionSheet, HeldSheetsContext, ListSheet, useSheetDraft, type ChHeldSheet } from '../../../ui/FormSheet';

/** The shared edit sheet, with the page guarding on its unsaved edits: closing or reloading the tab asks (CH-8508), and so does a link off the page (CH-8506). */
export function FormSheet(props: FormSheetProps) {
  const id = useId();
  useReportDirty(id, props.open && !!props.dirty);
  return <SheetBase {...props} />;
}

/** A short list of choices in a bottom sheet, instead of a dropdown; choosing one closes it with a selection tick. */
export function PickerSheet<V extends string>({
  open,
  onClose,
  title,
  options,
  value,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  options: ReadonlyArray<{ value: V; label: string }>;
  value: V;
  onPick: (v: V) => void;
}) {
  return (
    <ListSheet open={open} onClose={onClose} title={title}>
      <div className="ch-setm-card" role="radiogroup" aria-label={title}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={'ch-setm-row is-pick' + (o.value === value ? ' is-on' : '')}
            onClick={() => {
              haptic('select');
              onPick(o.value);
            }}
          >
            <span className="ch-setm-row__l">{o.label}</span>
            {o.value === value && <Icon icon={Check} size={18} className="ch-setm-check" />}
          </button>
        ))}
      </div>
    </ListSheet>
  );
}
