import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import type { Database, Json } from '@/lib/types/database';
import { getCoachChatContext, getCoachProgramPulse } from '@/lib/coachhelm/v3/chat/request-cache';
import { coverageLine, generalOpeners } from '@/lib/coachhelm/v3/chat/program-pulse';
import { restoreUIMessages } from '@/lib/coachhelm/v3/chat/restore';
import type { ChatMessage, ChatMessageStatus, ChatRole, ToolCallRecord, ToolResultRecord } from '@/lib/coachhelm/v3/chat/types';
import { chLogServer } from '../lib/track-server';
import { rebuiltHref } from '../shell/nav';
import { pulseItemsThatStand, pulseMissing } from './coachhelm-shape';
import {
  buildAskSuggestions,
  conversationTitle,
  noRoundsFrom,
  pulseToFindings,
  type ChAskConversation,
  type ChAskData,
  type ChAskLoad,
  type ChAskPulse,
  type ChAskThread,
} from './coachhelm-chat-shape';

export type * from './coachhelm-chat-shape';

/**
 * Ask CoachHelm (Clubhouse P013, the Ask sub-tab of /golf/dashboard/coachhelm; docs/clubhouse/drafts/intelligence.md
 * section 3.5). The inputs are the ones the production Ask page reads (`loadChatTab`), through the same request-cached
 * getters the dashboard layout already resolved, so nothing is read twice:
 *
 *   - the chat context (team, zone, the active roster) and the program pulse (`getCoachChatContext`, `getCoachProgramPulse`);
 *   - the coach's conversations and the requested thread, which row-level security already limits to the coach's own.
 *
 * Only a coach reaches this loader (the route checks the session first). A read that fails says so, in its own field, and
 * is never drawn as "nothing": the context failing is `failed`, the pulse failing is `pulse: null`, the list failing is
 * `conversations.error`, a thread whose messages did not read is `threadFailed`.
 *
 * A coach on two teams sees both teams' threads in History (a conversation carries no team), while the tools read the
 * active team's data. That is how production behaves; it is not changed here.
 */

type Supabase = SupabaseClient<Database>;

const log = (what: string, err: unknown) => chLogServer('coachhelm.ask', what, err, 'coachhelm');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readConversations(sb: Supabase): Promise<{ list: ChAskConversation[]; error: boolean }> {
  const res = await sb
    .from('golf_coachhelm_chat_conversations')
    .select('id, title, updated_at')
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false });
  if (res.error) {
    log('conversations', res.error);
    return { list: [], error: true };
  }
  return { list: (res.data ?? []).map((r) => ({ id: r.id, title: conversationTitle(r.title), updatedAt: r.updated_at })), error: false };
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  tool_calls: Json | null;
  tool_results: Json | null;
  cost_usd: number | null;
  created_at: string;
  client_turn_id: string | null;
  status: string | null;
  ui_parts: Json | null;
}

type ThreadRead = { kind: 'found'; thread: ChAskThread } | { kind: 'missing' } | { kind: 'failed' };

/** One conversation and its messages. A conversation that isn't there (or isn't this coach's: RLS hides it) is `missing`. */
async function readThread(sb: Supabase, id: string): Promise<ThreadRead> {
  const conv = await sb.from('golf_coachhelm_chat_conversations').select('id, title').eq('id', id).maybeSingle();
  if (conv.error) {
    log('thread', conv.error);
    return { kind: 'failed' };
  }
  if (!conv.data) return { kind: 'missing' };
  const msgs = await fromUntyped(sb, 'golf_coachhelm_chat_messages')
    .select('id, conversation_id, role, content, tool_calls, tool_results, cost_usd, created_at, client_turn_id, status, ui_parts')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });
  if (msgs.error) {
    log('messages', msgs.error);
    return { kind: 'failed' };
  }
  const rows = ((msgs.data ?? []) as MessageRow[]).map(
    (row): ChatMessage => ({
      id: row.id,
      conversation_id: row.conversation_id,
      role: row.role as ChatRole,
      content: row.content,
      tool_calls: (row.tool_calls as unknown as ToolCallRecord[] | null) ?? null,
      tool_results: (row.tool_results as unknown as ToolResultRecord[] | null) ?? null,
      cost_usd: row.cost_usd,
      created_at: row.created_at,
      client_turn_id: row.client_turn_id ?? null,
      status: (row.status as ChatMessageStatus | null) ?? null,
      ui_parts: Array.isArray(row.ui_parts) ? (row.ui_parts as unknown as Json[]) : null,
    }),
  );
  return { kind: 'found', thread: { id: conv.data.id, title: conversationTitle(conv.data.title), messages: restoreUIMessages(rows) } };
}

/**
 * Everything the Ask view draws. `conversationId` is `?c=`: a value that is not an id at all is a conversation that will
 * not open (`notFound`), never silently a new chat.
 */
export async function loadAskCoachHelm({ conversationId }: { conversationId?: string | null } = {}): Promise<ChAskLoad> {
  let ctx: Awaited<ReturnType<typeof getCoachChatContext>>;
  try {
    ctx = await getCoachChatContext();
  } catch (err) {
    log('context', err);
    return { status: 'failed' };
  }
  // A roster that did not read is empty because it could not be read, not because nobody is on the team: it is the context that
  // failed ("Ask couldn't load your program", with Try again), never "Add players to ask CoachHelm".
  if (ctx.roster_failed) {
    log('roster', new Error('the active roster did not read'));
    return { status: 'failed' };
  }
  if (ctx.roster.length === 0) return { status: 'noRoster', teamName: ctx.team_name };

  const asked = conversationId?.trim() || null;
  const wanted = asked && UUID.test(asked) ? asked : null;
  const sb = await createClient();
  const [pulse, conversations, thread] = await Promise.all([
    getCoachProgramPulse(),
    readConversations(sb),
    wanted ? readThread(sb, wanted) : Promise.resolve(null),
  ]);

  // A pulse some of whose reads failed: an item made from a failed read is not drawn (no rounds read is "no player has a round"), the
  // coverage line and the counts behind the openers come from rounds that were not read, and what is left says what is missing.
  const missing = pulseMissing(pulse?.failed);
  const roundsFailed = !!pulse?.failed?.includes('rounds');
  const pulseData: ChAskPulse | null = pulse
    ? {
        findings: pulseToFindings(pulseItemsThatStand(pulse.items, pulse.failed), (href) => rebuiltHref(href, 'coach')),
        coverage: roundsFailed ? null : coverageLine(pulse),
        // Formatted here, in the team's zone: a browser-side format of the same instant disagrees with the server render.
        asOfLabel: new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: ctx.timezone }).format(new Date(pulse.as_of)),
        ...(missing.length > 0 ? { missing } : {}),
      }
    : null;
  // The openers read the rounds counts; with the rounds unread they are the ones that assert nothing ("Brief me"), not "no rounds yet".
  const counted = pulse && roundsFailed ? { ...pulse, players_without_rounds: 0, players_with_recent_rounds: 0 } : pulse;

  const data: ChAskData = {
    coachId: ctx.coach_id,
    teamName: ctx.team_name,
    timezone: ctx.timezone,
    nowIso: new Date().toISOString(),
    players: ctx.roster.map((p) => ({ id: p.id, name: p.name })),
    suggestions: counted
      ? buildAskSuggestions({ openers: generalOpeners(counted, ctx.team_name), recentCovered: counted.players_with_recent_rounds, rosterCount: ctx.roster.length })
      : buildAskSuggestions({ openers: [], recentCovered: 0, rosterCount: ctx.roster.length }),
    pulse: pulseData,
    noRounds: noRoundsFrom(pulse),
    conversations,
    thread: thread?.kind === 'found' ? thread.thread : null,
    notFound: (!!asked && !wanted) || thread?.kind === 'missing',
    threadFailed: thread?.kind === 'failed',
  };
  return { status: 'ready', data };
}
