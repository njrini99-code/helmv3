import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let admin;
    try {
      admin = createAdminClient();
    } catch {
      return NextResponse.json(
        { error: 'Account deletion is not configured' },
        { status: 500 }
      );
    }

    const cleanupErrors: string[] = [];

    // Clean up baseball messages
    const { error: baseballMessagesError } = await admin
      .from('baseball_messages')
      .delete()
      .eq('sender_id', user.id);
    if (baseballMessagesError) cleanupErrors.push(`baseball_messages: ${baseballMessagesError.message}`);

    // Clean up golf messages
    const { error: golfMessagesError } = await admin
      .from('golf_messages')
      .delete()
      .eq('sender_id', user.id);
    if (golfMessagesError) cleanupErrors.push(`golf_messages: ${golfMessagesError.message}`);

    // Clean up engagement events
    const { error: engagementError } = await admin
      .from('baseball_player_engagement_events')
      .delete()
      .eq('coach_id', user.id);
    if (engagementError) cleanupErrors.push(`engagement_events: ${engagementError.message}`);

    const { error: userDeleteError } = await admin
      .from('users')
      .delete()
      .eq('id', user.id);

    if (userDeleteError) {
      return NextResponse.json(
        { error: 'Failed to delete account data' },
        { status: 500 }
      );
    }

    const { error: authDeleteError } = await admin.auth.admin.deleteUser(user.id);

    if (authDeleteError) {
      return NextResponse.json(
        { error: 'Failed to delete authentication user' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      warnings: cleanupErrors.length ? cleanupErrors : undefined,
    });
  } catch (error) {
    await logServerError(`Account deletion failed: ${error instanceof Error ? error.message : String(error)}`, { action: 'route.DELETE' });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
