/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: this file uses `as any` casts on the supabase client because
// `golf_event_documents` was added in 20260429000000_golf_event_documents.sql
// and the regenerated TS types don't include it yet. Once the type regen
// picks up the new table, the casts can be dropped.

'use server';

/**
 * Server actions for attaching team documents (golf_documents) to calendar
 * events (golf_events). The join table golf_event_documents enforces
 * RLS — coaches can attach/detach for their own team's events; players
 * (and coaches) on the team can read attached docs.
 *
 * Typical flow: a coach picks a practice plan PDF that already lives in
 * golf_documents and attaches it to Tuesday's practice event so every
 * player on the roster sees it surfaced inside the event detail.
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logServerError } from '@/lib/server-error-logger';
import type { GolfDocument } from '@/lib/types/golf';
import { withAdminObserved } from '@/lib/admin/observed-action';

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface EventDocumentRow {
  document: Pick<
    GolfDocument,
    | 'id'
    | 'title'
    | 'description'
    | 'file_url'
    | 'file_type'
    | 'file_size'
    | 'category'
  >;
  attachedAt: string;
  note: string | null;
}

/**
 * List documents attached to an event (RLS-gated to team membership).
 * Returns an empty array on missing event / no permission so callers can
 * render a "no attachments" affordance without try/catch noise.
 */
async function getEventDocumentsImpl(
  eventId: string,
): Promise<ActionResult<EventDocumentRow[]>> {
  if (!eventId) return { success: true, data: [] };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { data, error } = await (supabase as any)
      .from('golf_event_documents')
      .select(`
        attached_at,
        note,
        document:golf_documents (
          id,
          title,
          description,
          file_url,
          file_type,
          file_size,
          category
        )
      `)
      .eq('event_id', eventId)
      .order('attached_at', { ascending: true });

    if (error) {
      await logServerError(`getEventDocuments failed: ${error.message}`, {
        action: 'event_documents.getEventDocuments',
        featureArea: 'calendar',
        extra: { eventId, code: error.code },
      });
      return { success: false, error: 'Failed to load attachments' };
    }

    type Row = {
      attached_at: string;
      note: string | null;
      document: EventDocumentRow['document'] | null;
    };
    const rows = ((data ?? []) as unknown as Row[])
      .filter((r): r is Row & { document: NonNullable<Row['document']> } => r.document !== null)
      .map((r) => ({
        document: r.document,
        attachedAt: r.attached_at,
        note: r.note,
      }));

    return { success: true, data: rows };
  } catch (err) {
    await logServerError(`getEventDocuments error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'event_documents.getEventDocuments',
      featureArea: 'calendar',
      extra: { eventId },
    });
    return { success: false, error: 'Failed to load attachments' };
  }
}

const observedGetEventDocuments = withAdminObserved(
  'getEventDocuments',
  { sport: 'golf', feature: 'calendar_events' },
  getEventDocumentsImpl,
);

export async function getEventDocuments(
  eventId: string,
): Promise<ActionResult<EventDocumentRow[]>> {
  return observedGetEventDocuments(eventId);
}

/**
 * Attach an existing team document to an event. Idempotent — the composite
 * primary key (event_id, document_id) means a duplicate attach is a no-op.
 */
async function attachDocumentToEventImpl(
  eventId: string,
  documentId: string,
  note?: string,
): Promise<ActionResult> {
  if (!eventId || !documentId) {
    return { success: false, error: 'Event id and document id are required' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    // Defense-in-depth: verify the document belongs to the same team as the
    // event before letting the join row be created. The DB also enforces
    // this via golf_event_documents_assert_same_team trigger, but pre-flight
    // gives us a clean user-facing error message.
    const [{ data: eventRow }, { data: docRow }] = await Promise.all([
      supabase.from('golf_events').select('team_id').eq('id', eventId).maybeSingle(),
      supabase.from('golf_documents').select('team_id').eq('id', documentId).maybeSingle(),
    ]);
    if (!eventRow) return { success: false, error: 'Event not found' };
    if (!docRow) return { success: false, error: 'Document not found' };
    if (eventRow.team_id !== docRow.team_id) {
      return { success: false, error: 'Document is on a different team and cannot be attached' };
    }

    // Resolve coach.id for attached_by. RLS will reject the insert if the
    // caller doesn't coach the event's team, so we don't reauthorize here.
    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { error } = await (supabase as any)
      .from('golf_event_documents')
      .upsert(
        {
          event_id: eventId,
          document_id: documentId,
          attached_by: coach?.id ?? null,
          note: note ?? null,
        },
        { onConflict: 'event_id,document_id', ignoreDuplicates: false },
      );

    if (error) {
      await logServerError(`attachDocumentToEvent failed: ${error.message}`, {
        action: 'event_documents.attachDocumentToEvent',
        featureArea: 'calendar',
        extra: { eventId, documentId, code: error.code },
      });
      return {
        success: false,
        error: error.code === '42501'
          ? 'Only this team\'s coaches can attach documents'
          : 'Failed to attach document',
      };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    await logServerError(`attachDocumentToEvent error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'event_documents.attachDocumentToEvent',
      featureArea: 'calendar',
      extra: { eventId, documentId },
    });
    return { success: false, error: 'Failed to attach document' };
  }
}

const observedAttachDocumentToEvent = withAdminObserved(
  'attachDocumentToEvent',
  { sport: 'golf', feature: 'calendar_events' },
  attachDocumentToEventImpl,
);

export async function attachDocumentToEvent(
  eventId: string,
  documentId: string,
  note?: string,
): Promise<ActionResult> {
  return observedAttachDocumentToEvent(eventId, documentId, note);
}

async function detachDocumentFromEventImpl(
  eventId: string,
  documentId: string,
): Promise<ActionResult> {
  if (!eventId || !documentId) {
    return { success: false, error: 'Event id and document id are required' };
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated' };

    const { error } = await (supabase as any)
      .from('golf_event_documents')
      .delete()
      .eq('event_id', eventId)
      .eq('document_id', documentId);

    if (error) {
      await logServerError(`detachDocumentFromEvent failed: ${error.message}`, {
        action: 'event_documents.detachDocumentFromEvent',
        featureArea: 'calendar',
        extra: { eventId, documentId, code: error.code },
      });
      return {
        success: false,
        error: error.code === '42501'
          ? 'Only this team\'s coaches can detach documents'
          : 'Failed to detach document',
      };
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (err) {
    await logServerError(`detachDocumentFromEvent error: ${err instanceof Error ? err.message : String(err)}`, {
      action: 'event_documents.detachDocumentFromEvent',
      featureArea: 'calendar',
      extra: { eventId, documentId },
    });
    return { success: false, error: 'Failed to detach document' };
  }
}

const observedDetachDocumentFromEvent = withAdminObserved(
  'detachDocumentFromEvent',
  { sport: 'golf', feature: 'calendar_events' },
  detachDocumentFromEventImpl,
);

export async function detachDocumentFromEvent(
  eventId: string,
  documentId: string,
): Promise<ActionResult> {
  return observedDetachDocumentFromEvent(eventId, documentId);
}
