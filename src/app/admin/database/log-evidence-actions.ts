'use server';

/**
 * Server action behind the "Fetch Supabase evidence" form on
 * `/admin/database` — brief §32. Human-triggered only; never called from a
 * cron route. Delegates entirely to `fetchSupabaseLogEvidence`
 * (`src/lib/observability/supabase/log-evidence.ts`), which is disabled by
 * default and fails open — this action adds only auth, form parsing, and
 * the `useActionState` result shape.
 */
import { requireSuperAdmin } from '@/lib/admin/require-super-admin';
import { fetchSupabaseLogEvidence } from '@/lib/observability/supabase/log-evidence';
import { SUPABASE_SERVICES, type SupabaseService } from '@/lib/observability/supabase/envelope';
import { describeError } from '@/lib/utils/describe-error';

export interface LogEvidenceFormState {
  status: 'idle' | 'ok' | 'UNKNOWN_MANUAL' | 'error';
  reason?: string;
  timeline?: string[];
}

function isSupabaseService(value: FormDataEntryValue | null): value is SupabaseService {
  return typeof value === 'string' && (SUPABASE_SERVICES as readonly string[]).includes(value);
}

export async function fetchLogEvidenceAction(
  _prev: LogEvidenceFormState,
  formData: FormData,
): Promise<LogEvidenceFormState> {
  try {
    await requireSuperAdmin();
  } catch (err) {
    return {
      status: 'error',
      reason:
        describeError(err) === 'Unauthorized'
          ? 'Your session expired. Sign in again and retry.'
          : 'You do not have permission to fetch log evidence from Helm Bridge.',
    };
  }

  const serviceRaw = formData.get('service');
  if (!isSupabaseService(serviceRaw)) {
    return { status: 'error', reason: `Select a valid service (one of: ${SUPABASE_SERVICES.join(', ')}).` };
  }

  const traceIdRaw = formData.get('traceId');
  const traceId = typeof traceIdRaw === 'string' && traceIdRaw.trim().length > 0 ? traceIdRaw.trim() : null;

  const minutesRaw = formData.get('windowMinutes');
  const parsedMinutes = typeof minutesRaw === 'string' ? Number(minutesRaw) : NaN;
  const windowMinutes = Number.isFinite(parsedMinutes) ? parsedMinutes : 5;

  const result = await fetchSupabaseLogEvidence({
    service: serviceRaw,
    traceId,
    centerAt: new Date().toISOString(),
    windowMinutes,
  });

  return {
    status: result.status === 'ok' ? 'ok' : result.status === 'UNKNOWN_MANUAL' ? 'UNKNOWN_MANUAL' : 'error',
    reason: result.reason,
    timeline: result.timeline,
  };
}
