/**
 * Where a question came from on screen (MOTION.md MO-3-4, MO-2-4): the start or the follow-up the coach tapped. The thread reads
 * it when the question arrives, so the bubble rises out of the thing that was touched. A typed question has no entry here: its
 * source is the composer's field, which the thread finds itself.
 */
let source: { rect: DOMRect; at: number } | null = null;

/** A tap this long ago still counts as the source of the question that follows it. */
const FRESH_MS = 600;

/** Note the tapped control: anything inside an element carrying `data-ch-ask-source`. */
export function noteSendSource(target: EventTarget | null): void {
  const el = target instanceof Element ? target.closest<HTMLElement>('[data-ch-ask-source]') : null;
  if (el) source = { rect: el.getBoundingClientRect(), at: performance.now() };
}

/** The source of the question being sent now, once. */
export function takeSendSource(): DOMRect | null {
  const s = source;
  source = null;
  return s && performance.now() - s.at < FRESH_MS ? s.rect : null;
}
