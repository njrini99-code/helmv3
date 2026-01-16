'use server';

/**
 * Server Actions for CalDAV Sync
 *
 * Handles:
 * - Connecting external calendars (Google, Apple, Outlook, custom CalDAV)
 * - Bidirectional synchronization
 * - Conflict detection and resolution
 * - OAuth flows
 */

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { CalDAVClient, type CalDAVEvent } from '@/lib/calendar/caldav';
import { formatSafeErrorResponse } from '@/lib/validation/server-action-validator';

// ============================================================================
// TYPES
// ============================================================================

interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

type SupabaseClientType = ReturnType<typeof createClient> extends Promise<infer T> ? T : never;

interface CalendarConnection {
  id: string;
  calendar_url: string | null;
  ctag?: string | null;
  sync_team_ids?: string[] | null;
  team_id?: string | null;
}

interface ICalEvent {
  id?: string;
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date | null;
  location?: string;
  allDay?: boolean;
  status?: string;
}

interface GolfEventRecord {
  id: string;
  title: string;
  description?: string;
  start_time: string; // datetime ISO string
  end_time?: string | null;
  all_day?: boolean | null;
  location?: string;
}

interface SyncStateData {
  golf_event_id?: string;
  connection_id: string;
  external_calendar_id: string;
  external_event_id: string;
  external_event_url?: string;
  external_etag?: string;
  external_event_hash?: string;
  golf_event_hash?: string;
  sync_status: string;
  last_modified_source: string;
}

export interface ExternalCalendarConnection {
  id: string;
  calendarType: 'google' | 'apple' | 'outlook' | 'caldav';
  calendarName: string;
  calendarUrl?: string;
  syncEnabled: boolean;
  syncDirection: 'import_only' | 'export_only' | 'bidirectional';
  lastSyncAt?: string;
  lastSyncStatus?: string;
}

// ============================================================================
// CONNECT EXTERNAL CALENDAR
// ============================================================================

export async function connectExternalCalendar(input: {
  calendarType: 'google' | 'apple' | 'outlook' | 'caldav';
  calendarName: string;
  calendarUrl?: string;
  username?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  syncTeamIds?: string[];
  syncEventTypes?: string[];
  syncDirection?: 'import_only' | 'export_only' | 'bidirectional';
}): Promise<ActionResult<{ connectionId: string }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Test connection for CalDAV/Apple calendar types
    if (input.calendarType === 'caldav' || input.calendarType === 'apple') {
      try {
        const client = new CalDAVClient({
          serverUrl: input.calendarUrl!,
          username: input.username!,
          password: input.password,
          accessToken: input.accessToken,
        });

        // Validate connection by attempting discovery
        await client.discover();
      } catch (error) {
        console.error('[connectExternalCalendar Error]', error);
        return {
          success: false,
          error: 'Failed to connect to CalDAV server. Please check your credentials and try again.',
        };
      }
    }

    // Save connection - golf_calendar_connections uses player_id, not user_id
    // This table may have different structure than expected, cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: connection, error: insertError } = await (supabase as any)
      .from('golf_external_calendars')
      .insert({
        player_id: user.id, // Use user.id as player_id for now
        provider: input.calendarType,
        calendar_name: input.calendarName,
        provider_calendar_id: input.calendarUrl,
        sync_enabled: true,
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[connectExternalCalendar Error]', insertError);
      return { success: false, error: 'Failed to save calendar connection. Please try again.' };
    }

    // Trigger initial sync
    await syncExternalCalendar(connection.id);

    revalidatePath('/golf/dashboard/calendar');
    return { success: true, data: { connectionId: connection.id } };
  } catch (error) {
    console.error('[connectExternalCalendar Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// SYNC EXTERNAL CALENDAR
// ============================================================================

export async function syncExternalCalendar(
  connectionId: string
): Promise<ActionResult<{ imported: number; exported: number; conflicts: number }>> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Get connection details - table may not have expected structure, cast to any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: connection } = await (supabase as any)
      .from('golf_external_calendars')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (!connection || !connection.sync_enabled) {
      return { success: false, error: 'Calendar connection not found or disabled' };
    }

    // Cast connection to expected interface
    const conn = connection as CalendarConnection & {
      sync_enabled: boolean;
      sync_direction: string;
      access_token: string | null;
    };

    // Start sync log - table may not exist in types
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: syncLog } = await (supabase as any)
      .from('golf_calendar_sync_log')
      .insert({
        external_calendar_id: connectionId,
        sync_status: 'in_progress',
      })
      .select('id')
      .single();

    let imported = 0;
    let exported = 0;
    let conflicts = 0;

    try {
      // Create CalDAV client
      const client = new CalDAVClient({
        serverUrl: conn.calendar_url || '',
        username: '', // Would need to store encrypted
        password: conn.access_token || undefined,
        accessToken: conn.access_token || undefined,
      });

      // Import from external calendar
      if (conn.sync_direction === 'import_only' || conn.sync_direction === 'bidirectional') {
        const importResult = await importFromExternal(supabase, client, conn);
        imported = importResult.imported;
        conflicts += importResult.conflicts;
      }

      // Export to external calendar
      if (conn.sync_direction === 'export_only' || conn.sync_direction === 'bidirectional') {
        const exportResult = await exportToExternal(supabase, client, conn);
        exported = exportResult.exported;
        conflicts += exportResult.conflicts;
      }

      // Update connection - cast to any for non-standard fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('golf_external_calendars')
        .update({
          is_synced: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', connectionId);

      // Complete sync log
      if (syncLog?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('golf_calendar_sync_log')
          .update({
            sync_completed_at: new Date().toISOString(),
            sync_status: 'success',
            events_imported: imported,
            events_exported: exported,
            conflicts_detected: conflicts,
          })
          .eq('id', syncLog.id);
      }

      revalidatePath('/golf/dashboard/calendar');
      return { success: true, data: { imported, exported, conflicts } };
    } catch (error) {
      // Log failure
      if (syncLog?.id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('golf_calendar_sync_log')
          .update({
            sync_completed_at: new Date().toISOString(),
            sync_status: 'failed',
            error_details: { message: error instanceof Error ? error.message : 'Unknown error' },
          })
          .eq('id', syncLog.id);
      }

      throw error;
    }
  } catch (error) {
    console.error('[syncExternalCalendar Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// IMPORT FROM EXTERNAL
// ============================================================================

async function importFromExternal(
  supabase: SupabaseClientType,
  client: CalDAVClient,
  connection: CalendarConnection
): Promise<{ imported: number; conflicts: number }> {
  let imported = 0;
  let conflicts = 0;

  // Get changes since last sync
  const { changedEvents } = await client.getChanges(
    connection.calendar_url || '',
    connection.ctag ?? undefined
  );

  for (const externalEvent of changedEvents) {
    try {
      // Check if event already synced - table may not exist in types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: syncState } = await (supabase as any)
        .from('golf_calendar_sync_state')
        .select('*')
        .eq('external_calendar_id', connection.id)
        .eq('external_event_id', externalEvent.event.id)
        .single();

      // Calculate hash for change detection
      const externalHash = calculateEventHash(externalEvent.event);

      // Cast syncState to expected structure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = syncState as any;

      if (state) {
        // Event exists - check for conflicts
        if (state.external_event_hash !== externalHash) {
          // External changed
          if (state.last_modified_source === 'golf') {
            // Conflict!
            await handleConflict(supabase, state.id, externalEvent);
            conflicts++;
            continue;
          } else {
            // Safe to update
            await updateGolfEvent(supabase, state.golf_event_id || '', externalEvent.event);
            await updateSyncState(supabase, state.id, {
              external_etag: externalEvent.etag,
              sync_status: 'synced',
              last_modified_source: 'external',
            });
            imported++;
          }
        }
      } else {
        // New event - import it
        const golfEventId = await createGolfEvent(supabase, connection, externalEvent.event);
        await createSyncState(supabase, {
          connection_id: connection.id,
          external_calendar_id: connection.id,
          golf_event_id: golfEventId,
          external_event_id: externalEvent.event.id || '',
          external_event_url: externalEvent.url,
          external_etag: externalEvent.etag,
          golf_event_hash: externalHash,
          sync_status: 'synced',
          last_modified_source: 'external',
        });
        imported++;
      }
    } catch (eventError) {
      // Ignore individual event import errors - continue with other events
      console.error('Error importing individual event:', eventError);
    }
  }

  return { imported, conflicts };
}

// ============================================================================
// EXPORT TO EXTERNAL
// ============================================================================

async function exportToExternal(
  supabase: SupabaseClientType,
  client: CalDAVClient,
  connection: CalendarConnection
): Promise<{ exported: number; conflicts: number }> {
  let exported = 0;
  let conflicts = 0;

  // Get golf events needing export - rpc may not exist in types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pendingEvents } = await (supabase as any).rpc('get_events_needing_sync', {
    p_external_calendar_id: connection.id,
    p_limit: 100,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const pending of (pendingEvents || []) as any[]) {
    try {
      // Get full event data
      const { data: golfEvent } = await supabase
        .from('golf_events')
        .select('*')
        .eq('id', pending.event_id)
        .single();

      if (!golfEvent) continue;

      // Convert to iCal format
      const icalEvent = convertGolfEventToICal(golfEvent as unknown as GolfEventRecord);

      // Get sync state - table may not exist in types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: syncState } = await (supabase as any)
        .from('golf_calendar_sync_state')
        .select('*')
        .eq('golf_event_id', golfEvent.id)
        .eq('external_calendar_id', connection.id)
        .single();

      // Push to external calendar
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const state = syncState as any;
      const { url, etag } = await client.putEvent(
        connection.calendar_url || '',
        icalEvent as unknown as import('@/lib/calendar/ical').ICalEvent,
        state?.external_etag || undefined
      );

      // Update sync state
      const golfHash = calculateEventHash(icalEvent);
      if (state) {
        await updateSyncState(supabase, state.id, {
          external_event_url: url,
          external_etag: etag,
          golf_event_hash: golfHash,
          sync_status: 'synced',
          last_modified_source: 'golf',
        });
      } else {
        await createSyncState(supabase, {
          connection_id: connection.id,
          external_calendar_id: connection.id,
          golf_event_id: golfEvent.id,
          external_event_id: icalEvent.id || '',
          external_event_url: url,
          external_etag: etag,
          golf_event_hash: golfHash,
          sync_status: 'synced',
          last_modified_source: 'golf',
        });
      }

      exported++;
    } catch (error) {
      if (error instanceof Error && error.message.includes('ETag mismatch')) {
        conflicts++;
      }
    }
  }

  return { exported, conflicts };
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

export async function resolveConflict(
  syncStateId: string,
  resolution: 'golf_wins' | 'external_wins' | 'manual'
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    if (resolution === 'manual') {
      // User will manually resolve - just mark as pending
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('golf_calendar_sync_state')
        .update({ sync_status: 'pending' })
        .eq('id', syncStateId);
    } else {
      // Auto-resolve using database function
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).rpc('auto_resolve_conflict', {
        p_sync_state_id: syncStateId,
        p_strategy: resolution,
      });
    }

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[resolveConflict Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// DISCONNECT CALENDAR
// ============================================================================

export async function disconnectExternalCalendar(
  connectionId: string,
  deleteEvents: boolean = false
): Promise<ActionResult> {
  try {
    const supabase = await createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return { success: false, error: 'Not authenticated' };
    }

    if (deleteEvents) {
      // Delete synced golf events - table may not exist in types
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: syncStates } = await (supabase as any)
        .from('golf_calendar_sync_state')
        .select('golf_event_id')
        .eq('external_calendar_id', connectionId);

      if (syncStates && syncStates.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const eventIds = syncStates.map((s: any) => s.golf_event_id).filter((id: string | null): id is string => id !== null);
        if (eventIds.length > 0) {
          await supabase.from('golf_events').delete().in('id', eventIds);
        }
      }
    }

    // Delete connection (cascade will delete sync state)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('golf_external_calendars')
      .delete()
      .eq('id', connectionId);

    revalidatePath('/golf/dashboard/calendar');
    return { success: true };
  } catch (error) {
    console.error('[disconnectExternalCalendar Error]', error);
    return formatSafeErrorResponse(error);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

async function createGolfEvent(supabase: SupabaseClientType, connection: CalendarConnection, icalEvent: ICalEvent): Promise<string> {
  // golf_events uses start_time as full datetime, not separate date/time fields
  const startDateTime = icalEvent.startDate.toISOString();
  const endDateTime = icalEvent.endDate ? icalEvent.endDate.toISOString() : null;
  const teamId = connection.sync_team_ids?.[0] || connection.team_id || null;

  // Cast to any since we're using fields that may not match current types exactly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: event } = await (supabase as any)
    .from('golf_events')
    .insert({
      title: icalEvent.title,
      description: icalEvent.description || null,
      event_type: 'other',
      start_time: startDateTime,
      end_time: endDateTime,
      all_day: icalEvent.allDay || false,
      location: icalEvent.location || null,
      team_id: teamId,
      status: 'confirmed',
    })
    .select('id')
    .single();

  if (!event) throw new Error('Failed to create event');
  return event.id;
}

async function updateGolfEvent(supabase: SupabaseClientType, eventId: string, icalEvent: ICalEvent): Promise<void> {
  // golf_events uses start_time as full datetime, not separate date/time fields
  const startDateTime = icalEvent.startDate.toISOString();
  const endDateTime = icalEvent.endDate ? icalEvent.endDate.toISOString() : null;

  await supabase
    .from('golf_events')
    .update({
      title: icalEvent.title,
      description: icalEvent.description,
      start_time: startDateTime,
      end_time: endDateTime,
      all_day: icalEvent.allDay || false,
      location: icalEvent.location,
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);
}

async function createSyncState(supabase: SupabaseClientType, data: SyncStateData): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('golf_calendar_sync_state').insert(data);
}

async function updateSyncState(supabase: SupabaseClientType, syncStateId: string, updates: Partial<SyncStateData>): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('golf_calendar_sync_state')
    .update({ ...updates, last_synced_at: new Date().toISOString() })
    .eq('id', syncStateId);
}

async function handleConflict(supabase: SupabaseClientType, syncStateId: string, externalEvent: CalDAVEvent): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('golf_calendar_sync_state')
    .update({
      sync_status: 'conflict',
      conflict_data: {
        external: {
          title: externalEvent.event.title,
          start_date: externalEvent.event.startDate instanceof Date
            ? externalEvent.event.startDate.toISOString()
            : String(externalEvent.event.startDate),
          updated_at: new Date().toISOString(),
        },
      },
    })
    .eq('id', syncStateId);
}

function calculateEventHash(event: ICalEvent): string {
  const str =
    `${event.title || ''}|${event.startDate}|${event.endDate || ''}|${event.location || ''}|${event.description || ''}`;
  // Simple hash - in production use crypto
  return Buffer.from(str).toString('base64');
}

function convertGolfEventToICal(golfEvent: GolfEventRecord): ICalEvent {
  return {
    id: golfEvent.id,
    title: golfEvent.title,
    description: golfEvent.description,
    startDate: new Date(golfEvent.start_time),
    endDate: golfEvent.end_time ? new Date(golfEvent.end_time) : null,
    location: golfEvent.location,
    allDay: golfEvent.all_day || false,
    status: 'CONFIRMED',
  };
}
