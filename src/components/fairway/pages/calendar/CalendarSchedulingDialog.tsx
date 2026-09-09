'use client';

import * as React from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ModalShell } from '@/components/fairway/overlays/ModalShell';
import { Button, Skeleton } from '@/components/fairway';
import { cn } from '@/lib/utils';
import surfaces from './CalendarSurfaces.module.css';
import { SchedulingWorkspace } from './scheduling/SchedulingWorkspace';
import { useScheduleWindow } from '@/hooks/golf/use-schedule-window';
import { getScheduleWindow } from '@/app/golf/actions/scheduling';
import { evaluateSchedule } from '@/lib/calendar/scheduling/evaluate';
import type { ScheduleWindowRequest, ScheduleProposal } from '@/lib/calendar/scheduling-contracts';

export function CalendarSchedulingDialog({ request, initialProposal, onChange, onChoose, onClose, onOpenPerson }: {
  request: ScheduleWindowRequest | null;
  initialProposal?: ScheduleProposal;
  onChange: (request: ScheduleWindowRequest) => void;
  onChoose: (proposal: ScheduleProposal) => void;
  onClose: () => void;
  onOpenPerson?: (id: string) => void;
}) {
  const { snapshot, loading, error, retry } = useScheduleWindow(request, getScheduleWindow);
  const [checking, setChecking] = React.useState(false);
  const [verificationError, setVerificationError] = React.useState<string | null>(null);
  const requestRef = React.useRef(request);
  requestRef.current = request;
  const generation = React.useRef(0);
  React.useEffect(() => { generation.current++; setChecking(false); setVerificationError(null); }, [request]);

  const choose = async (proposal: ScheduleProposal) => {
    if (!request || checking) return;
    const currentGeneration = generation.current;
    const selectedRequest = request;
    setChecking(true); setVerificationError(null);
    try {
      const result = await getScheduleWindow(selectedRequest);
      if (currentGeneration !== generation.current || requestRef.current !== selectedRequest) return;
      if (!result.success) { setVerificationError(result.error); return; }
      const evaluation = evaluateSchedule(result.data, proposal);
      if (!evaluation.allAvailable) {
        setVerificationError(evaluation.unknown ? 'Some schedules could not be verified. Refresh before choosing this time.' : 'Availability changed. Review the updated overlaps before choosing a time.');
        retry(); return;
      }
      onChoose(proposal);
    } catch { setVerificationError('Unable to verify this time. Please retry.'); }
    finally { if (currentGeneration === generation.current) setChecking(false); }
  };
  return (
    <ModalShell open={Boolean(request)} onOpenChange={(open) => { if (!open) onClose(); }} title="Find a time" hideTitle hideClose size="full"
      className={cn(
        // Phone: the workspace IS the screen — full height, square corners, no
        // gutter. Tablet and up: a wide comparison canvas.
        'max-sm:!inset-0 max-sm:!h-[100dvh] max-sm:!w-full max-sm:!max-w-none max-sm:!rounded-none',
        'sm:!w-[calc(100vw-1rem)] sm:!max-w-[1200px] sm:h-[min(88dvh,900px)]',
        surfaces.scope,
        surfaces.panel,
      )}>
      {snapshot ? (
        <SchedulingWorkspace snapshot={snapshot} initialProposal={initialProposal} loading={loading || checking}
          error={verificationError || error} onRetry={retry} onClose={onClose} onChoose={(proposal) => { void choose(proposal); }}
          onDateChange={(date) => { if (request) onChange({ ...request, date }); }}
          onPersonClick={onOpenPerson} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">
          <div className="mb-6 flex items-center gap-3"><Button variant="ghost" aria-label="Back to calendar" onClick={onClose}><ArrowLeft className="h-5 w-5" /></Button><h2 className="text-title font-semibold">Find a time</h2></div>
          {error ? <div role="alert" className="space-y-4"><p>{error}</p><Button variant="secondary" onClick={retry} leftIcon={<RefreshCw className="h-4 w-4" />}>Try again</Button></div>
            : <div aria-label="Loading schedules" role="status" className="space-y-5"><Skeleton className="h-10 w-48" />{[0, 1, 2, 3, 4].map((key) => <Skeleton key={key} className="h-16 w-full" />)}<p className="text-sm text-text-secondary">Checking Helm schedules…</p></div>}
        </div>
      )}
    </ModalShell>
  );
}
