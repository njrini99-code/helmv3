/**
 * TEMP redesign direction C (removed before ship) — "does this sheet hold
 * unsaved edits?"
 *
 * STOPGAP. The exported panels report their dirty state into
 * FairwaySettingsGeneral's DirtyRegistryContext, which is module-private, so a
 * Sheet outside that file can't ask it. The real fix is one export there (a
 * `useDirtyState()` hook, or an `onDirtyChange` prop on UnsavedChangesGuard);
 * this module then goes away.
 *
 * Until then it reads the two things the panels do expose in the DOM:
 *
 *   1. The Save button. Every explicit-save panel renders SaveRow, whose
 *      Button is `variant={disabled ? 'secondary' : 'primary'}` with
 *      `disabled={!isDirty}`, so a primary Save IS the panel's isDirty, and
 *      `aria-busy` marks a save in flight.
 *   2. A signature of the form's values. EventRemindersPanel disables Save
 *      when an edit breaks the early/late ordering, so "Save is disabled"
 *      stops meaning "clean" there. Comparing the values against a baseline
 *      taken at the user's first touch catches that one case.
 *
 * Only rows declared as explicit-save use this. Autosave panels are never
 * probed, so they can never read as dirty.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type SaveButtonState = 'absent' | 'clean' | 'dirty' | 'saving';

export interface FormSnapshot {
  save: SaveButtonState;
  signature: string;
}

export interface ProbeMemory {
  /** The form's values just before the first touch, or right after a save. */
  baseline: string | null;
  last: FormSnapshot | null;
}

export interface ProbeVerdict {
  /** Closing now would throw edits away. */
  unsaved: boolean;
  /** A save is in flight. */
  saving: boolean;
}

export const FRESH_PROBE: ProbeMemory = { baseline: null, last: null };
const IDLE: ProbeVerdict = { unsaved: false, saving: false };

/* ── pure decision logic ────────────────────────────────────────────────────── */

/**
 * Take the baseline at the first pointer/key press inside the form, once the
 * form exists. Async panels fill their fields after mount, so a baseline taken
 * at mount would count the load itself as an edit.
 */
export function recordFirstTouch(memory: ProbeMemory, snap: FormSnapshot): ProbeMemory {
  if (memory.baseline !== null || snap.save === 'absent') return memory;
  return { ...memory, baseline: snap.signature };
}

export function advanceProbe(
  memory: ProbeMemory,
  snap: FormSnapshot,
): { memory: ProbeMemory; verdict: ProbeVerdict } {
  let { baseline } = memory;
  const prev = memory.last;
  if (prev && snap.save === 'clean') {
    // A save finished, or the panel's own snapshot caught up with values the
    // user didn't touch in this step (a profile reload after save). Either
    // way the current values are now the saved ones.
    const finishedSave = prev.save === 'saving';
    const caughtUp = prev.save === 'dirty' && prev.signature === snap.signature;
    if (finishedSave || caughtUp) baseline = snap.signature;
  }
  const verdict: ProbeVerdict = {
    saving: snap.save === 'saving',
    unsaved:
      snap.save === 'dirty' ||
      (snap.save === 'clean' && baseline !== null && snap.signature !== baseline),
  };
  return { memory: { baseline, last: snap }, verdict };
}

/* ── DOM readers ────────────────────────────────────────────────────────────── */

/**
 * SaveRow's button: the primary one, or (pristine) a disabled secondary one
 * that isn't busy. Retry buttons are enabled secondaries and the avatar upload
 * button is only disabled while busy, so neither is mistaken for it.
 */
export function readSaveButton(root: ParentNode): SaveButtonState {
  const buttons = root.querySelectorAll<HTMLButtonElement>('button[data-slot="fw-button"]');
  for (const button of Array.from(buttons)) {
    const variant = button.getAttribute('data-variant');
    const busy = button.getAttribute('aria-busy') === 'true';
    if (variant === 'primary') return busy ? 'saving' : 'dirty';
    if (variant === 'secondary' && button.disabled && !busy) return 'clean';
  }
  return 'absent';
}

const FIELD_SELECTOR =
  'input, textarea, select, [role="switch"], [aria-pressed], [data-slot="select-value"]';

export function formSignature(root: ParentNode): string {
  const parts: string[] = [];
  for (const el of Array.from(root.querySelectorAll(FIELD_SELECTOR))) {
    if (el instanceof HTMLInputElement) {
      parts.push(el.type === 'checkbox' || el.type === 'radio' ? String(el.checked) : el.value);
    } else if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      parts.push(el.value);
    } else if (el.getAttribute('role') === 'switch') {
      parts.push(el.getAttribute('aria-checked') ?? '');
    } else if (el.hasAttribute('aria-pressed')) {
      parts.push(el.getAttribute('aria-pressed') ?? '');
    } else {
      parts.push(el.textContent ?? '');
    }
  }
  return parts.join('\u001f');
}

export function snapshotForm(root: ParentNode): FormSnapshot {
  return { save: readSaveButton(root), signature: formSignature(root) };
}

/* ── hook ───────────────────────────────────────────────────────────────────── */

/**
 * Watches one sheet body. Pass `null` (sheet closed, or an autosave row) to
 * switch it off; each new root starts from a fresh baseline.
 */
export function useUnsavedProbe(root: HTMLElement | null) {
  const [verdict, setVerdict] = useState<ProbeVerdict>(IDLE);
  const memoryRef = useRef<ProbeMemory>(FRESH_PROBE);

  const readNow = useCallback((): ProbeVerdict => {
    if (!root) return IDLE;
    const step = advanceProbe(memoryRef.current, snapshotForm(root));
    memoryRef.current = step.memory;
    setVerdict((prev) =>
      prev.unsaved === step.verdict.unsaved && prev.saving === step.verdict.saving ? prev : step.verdict,
    );
    return step.verdict;
  }, [root]);

  useEffect(() => {
    memoryRef.current = FRESH_PROBE;
    if (!root) {
      setVerdict(IDLE);
      return undefined;
    }
    let frame = 0;
    // Input events fire before React commits the re-render they cause, so the
    // read waits a frame; DOM mutations are observed after the commit.
    const scheduleRead = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        readNow();
      });
    };
    const touch = () => {
      memoryRef.current = recordFirstTouch(memoryRef.current, snapshotForm(root));
    };
    const observer = new MutationObserver(() => {
      readNow();
    });
    observer.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
    root.addEventListener('pointerdown', touch, true);
    root.addEventListener('keydown', touch, true);
    root.addEventListener('input', scheduleRead, true);
    root.addEventListener('change', scheduleRead, true);
    readNow();
    return () => {
      observer.disconnect();
      root.removeEventListener('pointerdown', touch, true);
      root.removeEventListener('keydown', touch, true);
      root.removeEventListener('input', scheduleRead, true);
      root.removeEventListener('change', scheduleRead, true);
      window.cancelAnimationFrame(frame);
    };
  }, [root, readNow]);

  return { ...verdict, readNow };
}
