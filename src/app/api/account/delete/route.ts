import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const { error: messagesError } = await admin
      .from('messages')
      .delete()
      .eq('sender_id', user.id);
    if (messagesError) cleanupErrors.push(`messages: ${messagesError.message}`);

    const { error: profileViewsError } = await admin
      .from('profile_views')
      .delete()
      .eq('viewer_id', user.id);
    if (profileViewsError) cleanupErrors.push(`profile_views: ${profileViewsError.message}`);

    const { error: videoViewsError } = await admin
      .from('video_views')
      .delete()
      .eq('viewer_id', user.id);
    if (videoViewsError) cleanupErrors.push(`video_views: ${videoViewsError.message}`);

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
    console.error('Account deletion failed:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
