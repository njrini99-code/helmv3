/**
 * Which parts of a finished coach-chat turn are safe to keep.
 *
 * Extracted from the streaming route so both of its filters — what goes back
 * to the model, and what goes into `golf_coachhelm_chat_messages.ui_parts` —
 * share one definition of "this tool call never finished", and so that
 * definition is directly testable without booting the route.
 */

/**
 * The minimum shape these predicates need from an AI SDK UI message part.
 * Open-ended on purpose: real parts carry `text`, `input`, `output`,
 * `toolCallId`, `approval` and more, and none of it affects the decision.
 */
export interface InspectablePart {
  type: string;
  state?: unknown;
  [key: string]: unknown;
}

/**
 * The two AI SDK tool-part states that mean "the model asked for this call and
 * nothing ever answered it": the input is still streaming, or it is complete
 * and the call is queued but unexecuted.
 *
 * An agent loop can stop in either state — the step ceiling landing on a tool
 * call, an aborted stream, or a tool that threw before returning.
 */
const INCOMPLETE_TOOL_STATES: ReadonlySet<string> = new Set([
  'input-streaming',
  'input-available',
]);

/**
 * A tool call the model emitted that never produced a result.
 *
 * Deliberately NOT true for `approval-requested` / `approval-responded`.
 * Those are also output-less, but they are a call suspended on a coach's
 * decision — the entire confirm flow — and dropping them would silently make
 * every approved action inert.
 */
export function isIncompleteToolPart(part: InspectablePart): boolean {
  return (
    part.type.startsWith('tool-') &&
    typeof part.state === 'string' &&
    INCOMPLETE_TOOL_STATES.has(part.state)
  );
}

/**
 * The parts of a turn that may be stored and replayed to the coach.
 *
 * Reasoning is excluded twice — once at the transport (`sendReasoning: false`)
 * and again here — because the two protect against different failures. The
 * transport flag stops it reaching the browser; this stops an SDK default
 * change quietly filling the conversation table with model deliberation that a
 * reload would then hand back to the client.
 *
 * Dangling tool calls are excluded because storing one poisons the
 * conversation permanently: on reload the thread is rehydrated from
 * `ui_parts`, the orphaned `tool_use` block goes back to the provider with no
 * matching `tool_result`, and every later message in that conversation is
 * rejected with "Tool result is missing for tool call toolu_…".
 */
export function publishableParts(parts: readonly InspectablePart[]): unknown[] {
  return parts.filter((p) => p.type !== 'reasoning' && !isIncompleteToolPart(p));
}

/**
 * Whether an assistant turn contains something the coach can act on or replay.
 *
 * Approval requests commonly contain no prose and no `data-*` part: the tool
 * part itself is the Confirm card. Treating only text/data as content silently
 * drops that assistant turn before persistence.
 */
export function hasPersistableAssistantContent(
  message: { parts: readonly InspectablePart[] },
  text: string,
): boolean {
  if (text.trim().length > 0) return true;
  return message.parts.some(
    (part) =>
      part.type.startsWith('data-') ||
      (part.type.startsWith('tool-') && part.state === 'approval-requested'),
  );
}
