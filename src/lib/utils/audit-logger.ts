'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Logs an audit event to the audit_log table.
 * Call from server actions after mutations.
 */
export async function logAuditEvent(params: {
  action: string;
  tableName?: string;
  recordId?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
}) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('audit_log').insert({
      user_id: user.id,
      action: params.action,
      table_name: params.tableName || null,
      record_id: params.recordId || null,
      old_data: (params.oldData || null) as unknown as string,
      new_data: (params.newData || null) as unknown as string,
    });
  } catch {
    // Silently fail - audit logging should never block the main action
  }
}
