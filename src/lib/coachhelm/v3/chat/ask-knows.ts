import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { askTables } from './ask-db';

export type AskTone = 'straight' | 'detailed' | 'team_talk';
export interface AskKnows {
  tone: AskTone;
  facts: Array<{ id: string; text: string }>;
}

/** Tone and standing facts. Until HM2 is applied the table and column are missing and this answers null: the UI is hidden and tone is Straight. */
export async function readAskKnows(sb: SupabaseClient<Database>, input: { coachId: string; teamId: string; conversationId: string | null }): Promise<AskKnows | null> {
  const facts = await askTables(sb).from('golf_coachhelm_coach_facts').select('id, text').eq('coach_id', input.coachId).eq('team_id', input.teamId).order('created_at');
  if (facts.error) return null;
  let tone: AskTone = 'straight';
  if (input.conversationId) {
    const row = await askTables(sb).from('golf_coachhelm_chat_conversations').select('tone').eq('id', input.conversationId).maybeSingle();
    if (row.error) return null;
    tone = ((row.data as { tone?: AskTone } | null)?.tone ?? 'straight') as AskTone;
  }
  return { tone, facts: (facts.data ?? []) as unknown as AskKnows['facts'] };
}

const TONE_TEXT: Record<AskTone, string> = {
  straight: 'Tone: straight. Short, plain sentences; lead with the answer.',
  detailed: 'Tone: detailed. Walk through how you got there, with the reads in order.',
  team_talk: 'Tone: team talk. Write it so the coach could read it out to the team, without naming anyone unless asked.',
};

/** One section, spliced only with Ask v2 on. Figures and tool calls don't change with the tone. */
export function knowsSection(k: AskKnows): string {
  const facts = k.facts.length ? `\n\nStanding facts the coach gave:\n${k.facts.map((f) => `- ${f.text}`).join('\n')}` : '';
  return `## How to answer\n\n${TONE_TEXT[k.tone]} Your tool calls and every figure stay the same whatever the tone.${facts}`;
}
