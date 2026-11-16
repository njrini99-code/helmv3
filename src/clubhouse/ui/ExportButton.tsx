'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from './Button';
import { useToast } from './Toast';
import { haptic } from '../lib/haptics';
import { saveCsv, type ChCsvFile } from '../lib/csv';
import { chReport } from '../lib/track';
import { useChPhone } from '../lib/use-phone';

/** Thrown by a `file` builder whose read failed: the toast says the scores didn't load, not that the browser refused the file. */
export class ChExportReadError extends Error {
  constructor(message = 'export read failed') {
    super(message);
    this.name = 'ChExportReadError';
  }
}

/**
 * Launch readiness F-02: the one Export key. It builds the file at the press (`file`, which may read the server), then
 * hands it over through `lib/csv.ts`: the share sheet on a phone, a download anywhere else. A secondary key, so the press
 * is silent; the file landing taps success and says how much went (`done`), a failure taps error and says what to do,
 * with the page's catalog number (`code`). While a read is on its way the key is busy and says so (`busyCode`).
 */
export function ExportButton({
  file,
  done,
  failed,
  code,
  busyCode,
  surface,
  label = 'Export',
  icon,
  variant = 'secondary',
  size,
  className,
}: {
  file: () => ChCsvFile | Promise<ChCsvFile>;
  /** The toast once the file is out, from what it holds: "Rounds exported · 42 rounds". */
  done: (file: ChCsvFile) => string;
  /** What failed, in the coach's words: "Couldn’t export the rounds". */
  failed: string;
  code: string;
  busyCode?: string;
  surface: string;
  label?: string;
  /** A phone toolbar's icon key, named by this (its tooltip and accessible name): "Export rounds". */
  icon?: string;
  variant?: 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
}) {
  const phone = useChPhone();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const f = await file();
      const how = await saveCsv(f, { share: phone });
      if (how === 'cancelled') return;
      haptic('success');
      toast({ title: done(f), replace: 'ch-export' });
    } catch (err) {
      const read = err instanceof ChExportReadError;
      chReport(err, { surface, severity: 'low' });
      haptic('error');
      toast({
        tone: 'error',
        title: failed,
        body: read
          ? 'The scores didn’t load, so nothing was exported. Try again in a moment.'
          : 'Your browser didn’t take the file. Try again, or export from a computer.',
        code,
        replace: 'ch-export',
      });
    } finally {
      setBusy(false);
    }
  };

  if (icon)
    return (
      <>
        <IconButton icon={Download} label={icon} variant={variant} size={size} disabled={busy} onClick={() => void run()} className={className} />
        <span className="ch-sr-only" role="status" data-ch-code={busy ? busyCode : undefined}>
          {busy ? 'Exporting…' : ''}
        </span>
      </>
    );
  return (
    <Button variant={variant} size={size} leftIcon={Download} busy={busy} onClick={() => void run()} className={className}>
      {busy && busyCode ? <span data-ch-code={busyCode}>Exporting…</span> : label}
    </Button>
  );
}
