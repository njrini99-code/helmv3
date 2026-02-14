import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * GET /api/crm/google-calendar/callback
 * OAuth callback handler - redirects back to CRM
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUrl = new URL('/golf/admin/crm', baseUrl);

  // Handle OAuth errors
  if (error) {
    redirectUrl.searchParams.set('gcal_error', error);
    return NextResponse.redirect(redirectUrl);
  }

  if (!code || !state) {
    redirectUrl.searchParams.set('gcal_error', 'missing_params');
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      redirectUrl.searchParams.set('gcal_error', 'unauthorized');
      return NextResponse.redirect(redirectUrl);
    }

    // Verify state token
    let decodedState;
    try {
      decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      if (decodedState.userId !== user.id) {
        redirectUrl.searchParams.set('gcal_error', 'invalid_state');
        return NextResponse.redirect(redirectUrl);
      }
    } catch {
      redirectUrl.searchParams.set('gcal_error', 'invalid_state');
      return NextResponse.redirect(redirectUrl);
    }

    // Exchange code for tokens
    const redirectUri = `${baseUrl}/api/crm/google-calendar/callback`;
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      console.error('Token exchange failed:', await tokenResponse.text());
      redirectUrl.searchParams.set('gcal_error', 'token_exchange_failed');
      return NextResponse.redirect(redirectUrl);
    }

    const tokens = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Fetch primary calendar info
    let calendarName = 'Primary Calendar';
    try {
      const calendarResponse = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary',
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        }
      );
      if (calendarResponse.ok) {
        const calendar = await calendarResponse.json();
        calendarName = calendar.summary || 'Primary Calendar';
      }
    } catch (e) {
      console.error('Failed to fetch calendar info:', e);
    }

    // Store tokens
    const { error: dbError } = await supabase
      .from('crm_google_calendar_tokens')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || 'Bearer',
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        calendar_id: 'primary',
        calendar_name: calendarName,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (dbError) {
      console.error('Database error:', dbError);
      redirectUrl.searchParams.set('gcal_error', 'database_error');
      return NextResponse.redirect(redirectUrl);
    }

    // Success - redirect with success param
    redirectUrl.searchParams.set('gcal_connected', 'true');
    return NextResponse.redirect(redirectUrl);

  } catch (error) {
    console.error('Callback error:', error);
    redirectUrl.searchParams.set('gcal_error', 'unknown_error');
    return NextResponse.redirect(redirectUrl);
  }
}
