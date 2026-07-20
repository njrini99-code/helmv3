'use server';

// ============================================================================
// CRM REPLIES — SERVER ACTIONS (Phase 3 / Wave A2)
// ============================================================================
//
// Read/markRead surfaces for inbound coach replies persisted by
// /api/webhooks/resend-inbound. Combined with listMyDueTasks() (from
// crm-foundations.ts) by getInboxFeed() for the Inbox tab.
//
// All actions are admin-gated by RLS on crm_replies (see
// 20260429T3_crm_replies.sql). We still call auth.getUser() to fail fast
// on unauthenticated requests.
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';
import { listMyDueTasks } from './crm-foundations';
import type { CrmTask } from '../admin/crm/types/foundations';

// ----------------------------------------------------------------------------
// Public Reply shape — mirrors crm_replies row
// ----------------------------------------------------------------------------
export interface CrmReply {
  id: string;
  coach_id: string | null;
  contact_log_id: string | null;
  thread_id: string | null;
  message_id: string;
  in_reply_to: string | null;
  from_address: string;
  to_addresses: string[];
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  received_at: string;
  raw_payload: Record<string, unknown> | null;
  is_read: boolean;
}

// ----------------------------------------------------------------------------
// Internal helpers
// ----------------------------------------------------------------------------
async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

const CRM_INBOX_PATH = '/golf/admin/crm/inbox';

// Supabase typed client doesn't know about crm_replies yet. Cast around it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function normalizeReply(row: Record<string, unknown>): CrmReply {
  return {
    id: row.id as string,
    coach_id: (row.coach_id as string | null) ?? null,
    contact_log_id: (row.contact_log_id as string | null) ?? null,
    thread_id: (row.thread_id as string | null) ?? null,
    message_id: row.message_id as string,
    in_reply_to: (row.in_reply_to as string | null) ?? null,
    from_address: row.from_address as string,
    to_addresses: Array.isArray(row.to_addresses) ? (row.to_addresses as string[]) : [],
    subject: (row.subject as string | null) ?? null,
    body_text: (row.body_text as string | null) ?? null,
    body_html: (row.body_html as string | null) ?? null,
    received_at: row.received_at as string,
    raw_payload: (row.raw_payload as Record<string, unknown> | null) ?? null,
    is_read: Boolean(row.is_read),
  };
}

// ============================================================================
// Reads
// ============================================================================

export async function listReplies(opts?: {
  coachId?: string;
  threadId?: string;
  unreadOnly?: boolean;
  limit?: number;
}): Promise<CrmReply[]> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    let query = client
      .from('crm_replies')
      .select('*')
      .order('received_at', { ascending: false });

    if (opts?.coachId) {
      query = query.eq('coach_id', opts.coachId);
    }
    if (opts?.threadId) {
      query = query.eq('thread_id', opts.threadId);
    }
    if (opts?.unreadOnly) {
      query = query.eq('is_read', false);
    }
    if (opts?.limit && opts.limit > 0) {
      query = query.limit(opts.limit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to load replies: ${error.message}`);
    }
    return (data ?? []).map((row: Record<string, unknown>) => normalizeReply(row));
  } catch (error) {
    void logServerException(error, {
      action: 'crm_replies.listReplies',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

export async function getCoachReplies(coachId: string): Promise<CrmReply[]> {
  return listReplies({ coachId });
}

export async function markReplyRead(id: string): Promise<CrmReply> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_replies')
      .update({ is_read: true })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to mark reply read: ${error.message}`);
    }

    revalidatePath(CRM_INBOX_PATH);
    return normalizeReply(data as Record<string, unknown>);
  } catch (error) {
    void logServerException(error, {
      action: 'crm_replies.markReplyRead',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ----------------------------------------------------------------------------
// Inbox feed — replies + my-due-tasks merged. Tasks come from the Phase 1
// foundations action (already exists). We don't merge into a single sorted
// list here — the InboxView handles layout — we just hand back both arrays.
// ----------------------------------------------------------------------------
export async function getInboxFeed(opts?: {
  limit?: number;
}): Promise<{ replies: CrmReply[]; dueTasks: CrmTask[] }> {
  const limit = opts?.limit ?? 50;
  // Both calls are independent — run in parallel.
  const [replies, dueTasks] = await Promise.all([
    listReplies({ limit }),
    listMyDueTasks({ byEod: true, limit }),
  ]);
  return { replies, dueTasks };
}

// ----------------------------------------------------------------------------
// Reply context — the most recent outbound (email) crm_contact_log entry for
// a coach, sent before a given reply's received_at. Surfaces the "In reply
// to: <subject>" line in ReplyThread's footer so the reply reads in context
// of what we actually sent. Read-only; degrades to null (component renders
// nothing) rather than surfacing an error for what is a supplementary line.
// ----------------------------------------------------------------------------
export interface ReplyContext {
  subject: string | null;
  contactDate: string;
}

export async function getReplyContext(
  coachId: string,
  beforeIso: string,
): Promise<ReplyContext | null> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_contact_log')
      .select('subject, contact_date')
      .eq('coach_id', coachId)
      .eq('contact_type', 'email')
      .lt('contact_date', beforeIso)
      .order('contact_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load reply context: ${error.message}`);
    }
    if (!data) return null;

    return {
      subject: (data.subject as string | null) ?? null,
      contactDate: data.contact_date as string,
    };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_replies.getReplyContext',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}
