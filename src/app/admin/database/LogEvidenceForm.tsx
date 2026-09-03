'use client';

/**
 * "Fetch Supabase evidence" form — brief §32. Disabled unless the server
 * action's target (`fetchSupabaseLogEvidence`) is enabled via
 * `HELM_SUPABASE_LOG_EVIDENCE_ENABLED`; when it is not, submitting simply
 * renders the `UNKNOWN_MANUAL` state below rather than failing — the form
 * always renders so an operator can see the on-demand path exists, even
 * before the owner turns it on.
 */
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button, InlineNotice } from '@/components/fairway';
import { NativeSelect } from '@/components/ui/native-select';
import { Input } from '@/components/ui/input';
import { SUPABASE_SERVICES } from '@/lib/observability/supabase/envelope';
import { fetchLogEvidenceAction, type LogEvidenceFormState } from './log-evidence-actions';

const initialState: LogEvidenceFormState = { status: 'idle' };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" busy={pending}>
      {pending ? 'Fetching…' : 'Fetch Supabase evidence'}
    </Button>
  );
}

export function LogEvidenceForm() {
  const [state, formAction] = useActionState(fetchLogEvidenceAction, initialState);

  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-medium text-warm-600">
          Service
          <NativeSelect name="service" defaultValue="postgrest" className="mt-1 w-full">
            {SUPABASE_SERVICES.map((service) => (
              <option key={service} value={service}>
                {service}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="block text-xs font-medium text-warm-600" htmlFor="log-evidence-trace-id">
          Trace id (optional)
          <Input id="log-evidence-trace-id" name="traceId" placeholder="w3c trace id" className="mt-1 w-full" />
        </label>
        <label className="block text-xs font-medium text-warm-600" htmlFor="log-evidence-window-minutes">
          Window (minutes, each side of now)
          <Input
            id="log-evidence-window-minutes"
            name="windowMinutes"
            type="number"
            min={1}
            max={5}
            defaultValue={5}
            className="mt-1 w-full"
          />
        </label>
      </div>

      <SubmitButton />

      {state.status === 'UNKNOWN_MANUAL' ? (
        <InlineNotice tone="info" title="SUPABASE LOG EVIDENCE: UNKNOWN / MANUAL">
          {state.reason ?? 'This on-demand fetch is disabled by default. Set HELM_SUPABASE_LOG_EVIDENCE_ENABLED=true to enable it.'}
        </InlineNotice>
      ) : null}

      {state.status === 'error' ? (
        <InlineNotice tone="danger" title="Fetch failed">
          {state.reason}
        </InlineNotice>
      ) : null}

      {state.status === 'ok' ? (
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border-subtle p-3">
          {state.timeline && state.timeline.length > 0 ? (
            state.timeline.map((line, i) => (
              <p key={i} className="break-words font-fw-mono text-xs text-warm-700">
                {line}
              </p>
            ))
          ) : (
            <p className="text-xs text-warm-500">No matching log lines in this window.</p>
          )}
        </div>
      ) : null}
    </form>
  );
}
