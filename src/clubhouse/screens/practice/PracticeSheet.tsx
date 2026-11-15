'use client';

import { useChPhone } from '../../lib/use-phone';
import { Button } from '../../ui/Button';
import { FormSheet, type FormSheetProps } from '../../ui/FormSheet';
import { Modal } from '../../ui/Modal';

/**
 * One form, two rooms. `FormSheet` is the phone's sheet (Cancel, title and the action in its bar) and has no desktop drawing: on a Mac it opened as an
 * unstyled dialog, its three bar items stacked as plain text. On a desk the same form is the shared `Modal`, with Cancel and the action under the fields.
 * Same props either way, so a screen writes the form once.
 */
export function PracticeSheet(props: FormSheetProps) {
  const phone = useChPhone();
  if (phone) return <FormSheet {...props} />;
  const { open, onClose, title, actionLabel = 'Save', onAction, actionDisabled, danger, busy, full, code, note, children } = props;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={full ? 520 : 440}
      code={code}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} busy={busy} disabled={actionDisabled} onClick={onAction}>
            {actionLabel}
          </Button>
        </>
      }
    >
      <div className="ch-prc-sheetform">
        {children}
        {note && (
          <p className="ch-prc-new__err" role="alert">
            {note}
          </p>
        )}
      </div>
    </Modal>
  );
}
