/**
 * v3 coach chat — list conversations (W32-pt3).
 *
 * GET → list of the authed coach's conversations (RLS already scopes).
 * Used by the drawer's history pane and the full-history page.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logServerError } from '@/lib/server-error-logger';
import { listConversations } from '@/lib/coachhelm/v3/chat/persistence';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: coach } = await supabase
      .from('golf_coaches')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!coach) return NextResponse.json({ error: 'Not a coach' }, { status: 403 });

    const conversations = await listConversations(supabase);
    return NextResponse.json({ conversations });
  } catch (err) {
    await logServerError(
      `chat/conversations failed: ${err instanceof Error ? err.message : String(err)}`,
      { action: 'v3.chat.conversations' },
    );
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
