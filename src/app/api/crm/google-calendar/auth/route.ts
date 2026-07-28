import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

// Google OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL + '/api/crm/google-calendar/callback';

// Google OAuth URLs
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Scopes needed for calendar access
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

/**
 * GET /api/crm/google-calendar/auth
 * Initiates Google OAuth flow
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if Google OAuth is configured
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Google Calendar integration not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.' },
        { status: 500 }
      );
    }

    // Generate state token for CSRF protection
    const state = Buffer.from(JSON.stringify({
      userId: user.id,
      timestamp: Date.now(),
    })).toString('base64');

    // Build authorization URL
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: SCOPES,
      access_type: 'offline',
      prompt: 'consent', // Force consent to get refresh token
      state,
    });

    const authUrl = `${GOOGLE_AUTH_URL}?${params.toString()}`;

    return NextResponse.json({ authUrl });
  } catch (error) {
    await logServerError(`Google auth error: ${describeError(error)}`, { action: 'route.GET' });
    return NextResponse.json(
      { error: 'Failed to initiate Google authentication' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/crm/google-calendar/auth
 * Exchanges authorization code for tokens
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { code, state } = await request.json();

    if (!code) {
      return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
    }

    // Verify state token
    try {
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      if (decodedState.userId !== user.id) {
        return NextResponse.json({ error: 'Invalid state token' }, { status: 400 });
      }
      // Check if state is not too old (5 minutes)
      if (Date.now() - decodedState.timestamp > 5 * 60 * 1000) {
        return NextResponse.json({ error: 'State token expired' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid state token' }, { status: 400 });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID!,
        client_secret: GOOGLE_CLIENT_SECRET!,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      await logServerError(`Token exchange error: ${error}`, { action: 'google_calendar_auth.POST' });
      return NextResponse.json({ error: 'Failed to exchange authorization code' }, { status: 400 });
    }

    const tokens = await tokenResponse.json();

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

    // Store tokens in database
    const { error: dbError } = await supabase
      .from('crm_google_calendar_tokens')
      .upsert({
        user_id: user.id,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || 'Bearer',
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      });

    if (dbError) {
      await logServerError(`Database error storing tokens: ${describeError(dbError)}`, { action: 'route.POST' });
      return NextResponse.json({ error: 'Failed to store credentials' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    await logServerError(`Google auth callback error: ${describeError(error)}`, { action: 'route.POST' });
    return NextResponse.json(
      { error: 'Failed to complete authentication' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/crm/google-calendar/auth
 * Disconnects Google Calendar
 */
export async function DELETE(_request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Revoke the token at Google
    const { data: tokenData } = await supabase
      .from('crm_google_calendar_tokens')
      .select('access_token')
      .eq('user_id', user.id)
      .single();

    if (tokenData?.access_token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${tokenData.access_token}`, {
        method: 'POST',
      });
    }

    // Delete from database
    const { error } = await supabase
      .from('crm_google_calendar_tokens')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      await logServerError(`Error deleting tokens: ${describeError(error)}`, { action: 'route.DELETE' });
      return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    await logServerError(`Google disconnect error: ${describeError(error)}`, { action: 'route.DELETE' });
    return NextResponse.json(
      { error: 'Failed to disconnect Google Calendar' },
      { status: 500 }
    );
  }
}
