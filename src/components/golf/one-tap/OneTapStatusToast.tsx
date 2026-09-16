'use client';

import { Button } from '@/components/fairway/controls/button';
import type { OneTapView } from './use-one-tap';

/** §13: after a mark, "✓ Saved" with Undo for the 5 s undo window, then
 * nothing. Undo never occupies permanent screen space; later corrections
 * live behind ••• → Review hole. A tap with no location says so once and
 * saves nothing. */
const COPY: Record<NonNullable<OneTapView['statusToast']>['kind'], string> = {
  saved: '✓ Saved', saved_low: '✓ Saved · low confidence', saved_outside: '✓ Saved · outside mapped area', no_fix: 'No location · not saved',
};
export function OneTapStatusToast({ view }: { view: OneTapView }) {
  const toast = view.statusToast;
  if (!toast) return null;
  const warning = toast.kind === 'no_fix';
  return <div className="pointer-events-auto absolute inset-x-3 bottom-3 flex justify-center" data-slot="one-tap-toast" data-kind={toast.kind} role="status" aria-live="polite">
    <div className={`flex items-center gap-3 rounded-full border px-4 py-1.5 shadow-card ${warning ? 'border-border-subtle bg-surface text-text-primary' : 'border-border-subtle bg-surface text-text-primary'}`}>
      <span className="text-body-sm font-semibold">{COPY[toast.kind]}</span>
      {toast.undoable && <Button variant="ghost" size="sm" onClick={view.undo} data-slot="one-tap-undo">Undo</Button>}
    </div>
  </div>;
}
