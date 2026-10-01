'use client';

import { useEffect, useState } from 'react';
import { PreviewTracking } from '@/clubhouse/preview/PreviewTracking';
import { useEntryFailureToast } from '@/clubhouse/screens/rounds/entry/failures';
import { InProgressConflictDialog } from '@/clubhouse/screens/rounds/entry/InProgressConflictDialog';
import { RecoveryDialog } from '@/clubhouse/screens/rounds/entry/RecoveryDialog';
import { ReloadBanner, RoundErrorBanner } from '@/clubhouse/screens/rounds/entry/ReloadBanner';
import { SaveAsPracticeSheet } from '@/clubhouse/screens/rounds/entry/SaveAsPracticeSheet';
import { Button } from '@/clubhouse/ui/Button';
import { PREVIEW_CONFLICT, PREVIEW_ENTRY_NOW, PREVIEW_FAILURE_KEY, PREVIEW_PRACTICE_REASON, PREVIEW_RECOVERY } from './fixtures';

const strip = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '14px 16px' } as const;
const wait = (ms = 900) => new Promise<void>((r) => setTimeout(r, ms));
type Sheet = 'recovery' | 'conflict' | 'practice' | null;

/**
 * Round entry's dialogs and banners over the stand-in shot screen. Every
 * action is fake: a tap waits, then closes the dialog. `?state=` opens one at
 * a time; the `-busy` states hold their action, the `-error` states make it
 * fail (the Discard question in `conflict-error`), and `toast-*` raise the
 * failure toasts. Nothing reaches the server.
 */
export function PreviewEntry({ state }: { state?: string }) {
  const s = state ?? '';
  const fail = useEntryFailureToast();
  const [sheet, setSheet] = useState<Sheet>(s.startsWith('recovery') ? 'recovery' : s.startsWith('conflict') ? 'conflict' : s.startsWith('practice') ? 'practice' : null);
  const [banner, setBanner] = useState<'reload' | 'error' | null>(s === 'reload' || s === 'reloading' ? 'reload' : s === 'error' ? 'error' : null);
  const [reloading, setReloading] = useState(s === 'reloading');
  const [restoring, setRestoring] = useState(s === 'recovery-busy');
  const [restoreError, setRestoreError] = useState<string | null>(s === 'recovery-error' ? PREVIEW_FAILURE_KEY : null);
  const [conflictBusy, setConflictBusy] = useState(s === 'conflict-busy');
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [pending, setPending] = useState<'practice' | 'save' | 'discard' | null>(s === 'practice-busy' ? 'practice' : null);
  const [practiceError, setPracticeError] = useState<string | null>(s === 'practice-error' ? PREVIEW_FAILURE_KEY : null);

  const toasts = {
    save: () => fail('save-for-later', { course: 'Finley GC', reason: PREVIEW_FAILURE_KEY, run: () => setSheet(null) }),
    discard: () => fail('discard-round', { course: 'Finley GC', run: () => setSheet(null) }),
    updated: () => fail('round-updated', { run: () => setBanner('reload') }),
  };
  useEffect(() => {
    if (s === 'toast-save') toasts.save();
    if (s === 'toast-discard') toasts.discard();
    if (s === 'toast-updated') toasts.updated();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async () => {
    setRestoreError(null);
    setRestoring(true);
    await wait();
    setRestoring(false);
    if (s === 'recovery-error') setRestoreError(PREVIEW_FAILURE_KEY);
    else setSheet(null);
  };
  const startSeparate = async () => {
    setConflictBusy(true);
    await wait();
    setConflictBusy(false);
    setSheet(null);
  };
  const discardOther = async () => {
    setConflictError(null);
    setConflictBusy(true);
    await wait();
    setConflictBusy(false);
    if (s === 'conflict-error') setConflictError(PREVIEW_FAILURE_KEY);
    else setSheet(null);
  };
  const practice = async () => {
    setPracticeError(null);
    setPending('practice');
    await wait();
    setPending(null);
    if (s === 'practice-error') setPracticeError(PREVIEW_FAILURE_KEY);
    else setSheet(null);
  };
  const run = (which: 'save' | 'discard') => async () => {
    setPending(which);
    await wait();
    setPending(null);
    setSheet(null);
  };
  const reload = async () => {
    setReloading(true);
    await wait(1500);
    setReloading(false);
  };

  return (
    <>
      <div style={strip}>
        <span>Round entry</span>
        <Button size="sm" onClick={() => setSheet('recovery')}>
          Recovery
        </Button>
        <Button size="sm" onClick={() => setSheet('conflict')}>
          Already in progress
        </Button>
        <Button size="sm" onClick={() => setSheet('practice')}>
          Qualifier closed
        </Button>
        <Button size="sm" onClick={() => setBanner('reload')}>
          Reload banner
        </Button>
        <Button size="sm" onClick={() => setBanner('error')}>
          Error banner
        </Button>
        <Button size="sm" onClick={toasts.save}>
          Save failed
        </Button>
        <Button size="sm" onClick={toasts.discard}>
          Discard failed
        </Button>
        <Button size="sm" onClick={toasts.updated}>
          Round updated
        </Button>
      </div>
      {banner === 'reload' && (
        <div style={strip}>
          <ReloadBanner reloading={reloading} onReload={reload} />
        </div>
      )}
      {banner === 'error' && (
        <div style={strip}>
          <RoundErrorBanner message="Hole 4 didn’t save. Your shots are kept on this device; try again to move on." onDismiss={() => setBanner(null)} />
        </div>
      )}
      <PreviewTracking state="approach" />
      <RecoveryDialog
        open={sheet === 'recovery'}
        {...PREVIEW_RECOVERY}
        now={PREVIEW_ENTRY_NOW}
        restoring={restoring}
        error={restoreError}
        onRestore={restore}
        onDiscard={() => setSheet(null)}
        onClose={() => setSheet(null)}
      />
      <InProgressConflictDialog
        open={sheet === 'conflict'}
        {...PREVIEW_CONFLICT}
        now={PREVIEW_ENTRY_NOW}
        busy={conflictBusy}
        error={conflictError}
        onResume={() => setSheet(null)}
        onStartSeparate={startSeparate}
        onDiscard={discardOther}
        onClose={() => setSheet(null)}
      />
      <SaveAsPracticeSheet
        open={sheet === 'practice'}
        reason={PREVIEW_PRACTICE_REASON}
        pending={pending}
        error={practiceError}
        onSaveAsPractice={practice}
        onSaveForLater={run('save')}
        onGoBack={() => setSheet(null)}
        onDiscard={run('discard')}
      />
    </>
  );
}
