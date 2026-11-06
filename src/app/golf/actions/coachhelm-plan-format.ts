'use server';

import { generateObject } from 'ai';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { withAdminObserved } from '@/lib/admin/observed-action';
import { resolveModelProvider } from '@/lib/ai/model-provider';
import { MODEL_FOR_TASK } from '@/lib/coachhelm/v3/llm/types';
import { logServerError } from '@/lib/server-error-logger';
import { isPracticePlansEnabled } from '@/lib/coachhelm/v3/practice-plan/flag';
import { practiceTables } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { getPreviewUrl } from './documents';

const Sections = z.object({ sections: z.array(z.object({ key: z.enum(['header', 'groups', 'schedule', 'bring', 'notes']), name: z.string().max(40) })).max(8) });
export type FormatSections = z.infer<typeof Sections>['sections'];

/** Layout only: section names and order. A new plan's drills, times and groups never come from the sample. */
async function readPlanFormatImpl(documentId: string): Promise<{ success: true; sections: FormatSections } | { success: false; error: string }> {
  if (!isPracticePlansEnabled()) return { success: false, error: 'Comes with the Practice tab.' };
  const preview = await getPreviewUrl(documentId);
  if (!preview.data) return { success: false, error: 'That file couldn’t be read.' };
  try {
    const isPdf = preview.data.mimeType.includes('pdf');
    const { object } = await generateObject({
      model: resolveModelProvider(MODEL_FOR_TASK.coach_chat),
      schema: Sections,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'This is a golf team\'s practice plan. Name its sections in order, layout only. Never copy a person, a drill or a time.' }, isPdf ? { type: 'file', data: new URL(preview.data.url), mediaType: 'application/pdf' } : { type: 'image', image: new URL(preview.data.url) }] }],
    });
    return { success: true, sections: object.sections };
  } catch (err) {
    await logServerError(`readPlanFormat failed: ${err instanceof Error ? err.message : 'unknown'}`, { action: 'coachhelm.plan.format' }, 'warning');
    return { success: false, error: 'That file couldn’t be read.' };
  }
}

export interface PriorFormat {
  source_document_id: string | null;
  name: string;
  sections: FormatSections;
}

async function setPlanFormatImpl(input: { documentId: string; name: string; sections: FormatSections }): Promise<{ success: boolean; error?: string; id?: string; prior?: PriorFormat | null }> {
  if (!isPracticePlansEnabled()) return { success: false, error: 'Comes with the Practice tab.' };
  const sb = await createClient();
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (!ctx) return { success: false, error: 'Unauthorized' };
  // There's one row a team, and the upsert overwrites it: keep what it said, so Undo can put it back.
  const { data: was } = await practiceTables(sb).from('golf_practice_plan_formats').select('source_document_id, name, sections').eq('team_id', ctx.team_id).maybeSingle();
  const prior = (was as PriorFormat | null) ?? null;
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_formats').upsert({ team_id: ctx.team_id, source_document_id: input.documentId, name: input.name, sections: input.sections, created_by: ctx.user_id }, { onConflict: 'team_id' }).select('id').maybeSingle();
  if (error) return { success: false, error: isPracticeMissing(error.code) ? 'Comes with the Practice tab.' : 'The format wasn’t set.' };
  return { success: true, id: (data as { id?: string } | null)?.id, prior };
}

/** Undo: the format before this one comes back, or the team's standard sheet if there wasn't one. */
async function undoPlanFormatImpl(input: { id: string; prior: PriorFormat | null }): Promise<{ success: boolean }> {
  const sb = await createClient();
  const table = practiceTables(sb).from('golf_practice_plan_formats');
  const { error } = input.prior ? await table.update({ source_document_id: input.prior.source_document_id, name: input.prior.name, sections: input.prior.sections }).eq('id', input.id) : await table.delete().eq('id', input.id);
  return { success: !error };
}

const obsRead = withAdminObserved('readPlanFormat', { sport: 'golf', feature: 'practice_plans' }, readPlanFormatImpl);
const obsSet = withAdminObserved('setPlanFormat', { sport: 'golf', feature: 'practice_plans' }, setPlanFormatImpl);
const obsUndo = withAdminObserved('undoPlanFormat', { sport: 'golf', feature: 'practice_plans' }, undoPlanFormatImpl);

export async function readPlanFormat(documentId: string) {
  return obsRead(documentId);
}
export async function setPlanFormat(input: Parameters<typeof setPlanFormatImpl>[0]) {
  return obsSet(input);
}
export async function undoPlanFormat(input: { id: string; prior: PriorFormat | null }) {
  return obsUndo(input);
}
