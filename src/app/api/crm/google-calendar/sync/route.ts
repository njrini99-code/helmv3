import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

interface GoogleCalendarEvent {
  id?: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone?: string } | { date: string };
  end: { dateTime: string; timeZone?: string } | { date: string };
  conferenceData?: {
    entryPoints?: Array<{ uri: string; entryPointType: string }>;
  };
}

/**
 * Refresh access token if expired
 */
async function refreshAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, refreshToken: string): Promise<string | null> {
  try {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      await logServerError(`Token refresh failed: ${errorText}`, { action: 'google_calendar_sync.refreshAccessToken' });
      return null;
    }

    const tokens = await response.json();
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Update stored token
    await supabase
      .from('crm_google_calendar_tokens')
      .update({
        access_token: tokens.access_token,
        expires_at: expiresAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return tokens.access_token;
  } catch (error) {
    await logServerError(`Token refresh error: ${describeError(error)}`, { action: 'route.refreshAccessToken' });
    return null;
  }
}

/**
 * Get valid access token (refreshing if needed)
 */
async function getValidAccessToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: tokenData, error } = await supabase
    .from('crm_google_calendar_tokens')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();

  if (error || !tokenData) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(tokenData.expires_at);
  const now = new Date(Date.now() + 5 * 60 * 1000);

  if (expiresAt <= now && tokenData.refresh_token) {
    return refreshAccessToken(supabase, userId, tokenData.refresh_token);
  }

  return tokenData.access_token;
}

/**
 * POST /api/crm/google-calendar/sync
 * Sync a single event to Google Calendar
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { eventId, action } = await request.json();

    if (!eventId) {
      return NextResponse.json({ error: 'Event ID required' }, { status: 400 });
    }

    // Get access token
    const accessToken = await getValidAccessToken(supabase, user.id);
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 401 });
    }

    // Get event details
    const { data: event, error: eventError } = await supabase
      .from('crm_events')
      .select(`
        *,
        coach:crm_coaches(name, school, email)
      `)
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Handle delete action
    if (action === 'delete' && event.google_event_id) {
      const deleteResponse = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/primary/events/${event.google_event_id}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      if (deleteResponse.ok || deleteResponse.status === 404) {
        await supabase
          .from('crm_events')
          .update({
            google_event_id: null,
            google_sync_status: 'pending',
            google_last_synced_at: null,
          })
          .eq('id', eventId);

        return NextResponse.json({ success: true, action: 'deleted' });
      }
    }

    // Build Google Calendar event
    const googleEvent: GoogleCalendarEvent = {
      summary: event.title,
      description: buildEventDescription(event),
      location: event.location || undefined,
      start: event.all_day
        ? { date: event.start_time.split('T')[0]! }
        : { dateTime: event.start_time },
      end: event.all_day
        ? { date: event.end_time.split('T')[0]! }
        : { dateTime: event.end_time },
    };

    // Add meeting URL as conference data if available
    if (event.meeting_url) {
      googleEvent.description = (googleEvent.description || '') + `\n\nMeeting Link: ${event.meeting_url}`;
    }

    let response;
    let googleEventId: string;

    if (event.google_event_id) {
      // Update existing event
      response = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/primary/events/${event.google_event_id}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      );
      googleEventId = event.google_event_id;
    } else {
      // Create new event
      response = await fetch(
        `${GOOGLE_CALENDAR_API}/calendars/primary/events`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(googleEvent),
        }
      );

      if (response.ok) {
        const created = await response.json();
        googleEventId = created.id;
      } else {
        const error = await response.text();
        await logServerError(`Google Calendar API error: ${error}`, { action: 'google_calendar_sync.POST' });
        return NextResponse.json({ error: 'Failed to create event in Google Calendar' }, { status: 500 });
      }
    }

    if (!response.ok) {
      const error = await response.text();
      await logServerError(`Google Calendar API error: ${error}`, { action: 'google_calendar_sync.POST' });

      // Update sync status to error
      await supabase
        .from('crm_events')
        .update({
          google_sync_status: 'error',
        })
        .eq('id', eventId);

      return NextResponse.json({ error: 'Failed to sync with Google Calendar' }, { status: 500 });
    }

    // Update our event with Google Calendar ID
    await supabase
      .from('crm_events')
      .update({
        google_event_id: googleEventId,
        google_calendar_id: 'primary',
        google_sync_status: 'synced',
        google_last_synced_at: new Date().toISOString(),
      })
      .eq('id', eventId);

    return NextResponse.json({
      success: true,
      googleEventId,
      action: event.google_event_id ? 'updated' : 'created',
    });

  } catch (error) {
    await logServerError(`Sync error: ${describeError(error)}`, { action: 'route.POST' });
    return NextResponse.json(
      { error: 'Failed to sync event' },
      { status: 500 }
    );
  }
}

/**
 * Build event description with coach info
 */
function buildEventDescription(event: Record<string, unknown>): string {
  const parts: string[] = [];

  if (event.description) {
    parts.push(event.description as string);
  }

  const coach = event.coach as Record<string, string> | null;
  if (coach) {
    parts.push('');
    parts.push('--- Coach Info ---');
    parts.push(`School: ${coach.school}`);
    parts.push(`Coach: ${coach.name}`);
    if (coach.email) {
      parts.push(`Email: ${coach.email}`);
    }
  }

  parts.push('');
  parts.push('Created via GolfHelm CRM');

  return parts.join('\n');
}

/**
 * GET /api/crm/google-calendar/sync
 * Sync all pending events to Google Calendar
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get access token
    const accessToken = await getValidAccessToken(supabase, user.id);
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Calendar not connected' }, { status: 401 });
    }

    // Get events that need syncing
    const { data: events, error } = await supabase
      .from('crm_events')
      .select(`
        *,
        coach:crm_coaches(name, school, email)
      `)
      .eq('google_sync_status', 'pending')
      .limit(50);

    if (error) {
      await logServerError(`CRM Google Calendar batch sync events fetch failed: ${error.message}`, {
        action: 'googleCalendarSyncApi.get.eventsFetch',
        route: '/api/crm/google-calendar/sync',
        url: request.url,
        source: 'route_handler',
        sport: 'golf',
        featureArea: 'crm_google_calendar_sync',
        userId: user.id,
        statusCode: 500,
      }, 'error');
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (const event of events || []) {
      try {
        const googleEvent: GoogleCalendarEvent = {
          summary: event.title,
          description: buildEventDescription(event),
          location: event.location || undefined,
          start: event.all_day
            ? { date: event.start_time.split('T')[0]! }
            : { dateTime: event.start_time },
          end: event.all_day
            ? { date: event.end_time.split('T')[0]! }
            : { dateTime: event.end_time },
        };

        const response = await fetch(
          `${GOOGLE_CALENDAR_API}/calendars/primary/events`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(googleEvent),
          }
        );

        if (response.ok) {
          const created = await response.json();
          await supabase
            .from('crm_events')
            .update({
              google_event_id: created.id,
              google_calendar_id: 'primary',
              google_sync_status: 'synced',
              google_last_synced_at: new Date().toISOString(),
            })
            .eq('id', event.id);
          results.synced++;
        } else {
          results.failed++;
          results.errors.push(`Event ${event.id}: ${response.statusText}`);
        }
      } catch (e) {
        results.failed++;
        results.errors.push(`Event ${event.id}: ${(e as Error).message}`);
      }
    }

    if (results.failed > 0) {
      // Roll-up, not one log per event — the loop above can touch up to 50
      // events per run and per-event logging would flood error_logs/Sentry.
      await logServerError(`CRM Google Calendar batch sync: ${results.failed} of ${events?.length ?? 0} events failed`, {
        action: 'googleCalendarSyncApi.get.batchSync',
        route: '/api/crm/google-calendar/sync',
        url: request.url,
        source: 'route_handler',
        sport: 'golf',
        featureArea: 'crm_google_calendar_sync',
        userId: user.id,
        metadata: {
          failedCount: results.failed,
          syncedCount: results.synced,
          firstError: results.errors[0] ?? null,
        },
      }, 'warning');
    }

    // Update last sync timestamp
    await supabase
      .from('crm_google_calendar_tokens')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('user_id', user.id);

    return NextResponse.json(results);

  } catch (error) {
    await logServerError(`Batch sync error: ${describeError(error)}`, { action: 'route.GET' });
    return NextResponse.json(
      { error: 'Failed to sync events' },
      { status: 500 }
    );
  }
}
