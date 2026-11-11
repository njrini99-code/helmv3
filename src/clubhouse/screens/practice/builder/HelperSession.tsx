'use client';

import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef } from 'react';
import { useCoachHelmChat } from '@/components/golf/coachhelm/chat/useCoachHelmChat';
import type { AskBriefData } from '../../../data/coachhelm-chat-thread';
import type { PlanPartData } from '../../coachhelm/plan/PlanCard';
import { PlanIntake } from '../../coachhelm/plan/PlanIntake';

const partsOf = (m: UIMessage) => m.parts as Array<{ type: string; data?: unknown; text?: string }>;

/** The newest plan and question card in the run, and what it last said, read from the same stream Ask reads. */
export function readRun(messages: readonly UIMessage[]): { plan: PlanPartData | null; brief: AskBriefData | null; said: string } {
  let plan: PlanPartData | null = null;
  let brief: AskBriefData | null = null;
  let said = '';
  for (const m of messages) {
    if (m.role !== 'assistant') continue;
    for (const p of partsOf(m)) {
      if (p.type === 'data-practice-plan') plan = p.data as PlanPartData;
      else if (p.type === 'data-brief') brief = p.data as AskBriefData;
      else if (p.type === 'text' && p.text) said = p.text;
    }
  }
  return { plan, brief, said };
}

/**
 * The helper's run: the chat hook, in its own lazy chunk, sending one request through the same endpoint and tools as Ask (`draft_practice_plan`, which writes nothing).
 * The plan it answers with comes back as suggestions; Save stays the builder's. If it asks a question first, the same card Ask draws is drawn here. The thread is kept in
 * the coach's chats, as any Ask is.
 */
export default function HelperSession({ request, onPlan, onDone }: { request: string; onPlan: (plan: PlanPartData) => void; onDone: (r: { failed: boolean; said: string; busy: boolean }) => void }) {
  // The helper's own surface: the server picks the instructions and the tool set by it (not Ask's).
  const chat = useCoachHelmChat({ surface: 'practice_helper' });
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (sent.current === request) return;
    sent.current = request;
    chat.send(request);
    // One send per request: `chat` changes on every token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request]);
  const run = useMemo(() => readRun(chat.messages), [chat.messages]);
  const seen = useRef<PlanPartData | null>(null);
  useEffect(() => {
    if (run.plan && run.plan !== seen.current) {
      seen.current = run.plan;
      onPlan(run.plan);
    }
  }, [run.plan, onPlan]);
  useEffect(() => {
    onDone({ failed: !!chat.error, said: run.plan ? '' : run.said, busy: chat.busy });
  }, [chat.error, chat.busy, run.plan, run.said, onDone]);
  if (!run.plan && run.brief && !chat.busy) return <PlanIntake brief={run.brief} onSend={chat.send} />;
  return null;
}
