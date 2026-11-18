import type { UIMessage } from 'ai';
import type { InspectablePart } from '@/lib/coachhelm/v3/chat/ui-parts';

/** The SDK updates keyed data in place (e.g. a held receipt becoming final).
 * A length slice loses those updates; copying the whole message duplicates
 * the first leg's text, evidence and cards. Keep additions and changed data.
 */
export function continuationParts(before: UIMessage['parts'], after: UIMessage['parts']): UIMessage['parts'] {
  return after.filter((part, index) => index >= before.length || (
    part.type.startsWith('data-') && JSON.stringify(part) !== JSON.stringify(before[index])
  ));
}

/** Pair each proposal with the corresponding tool of that name, in order.
 * Multiple tools in one step can have different answers; one denial must
 * never deny its approved sibling. Unknown/missing pairs do nothing.
 */
export function deniedProposalKeys(messages: readonly { role: string; parts: InspectablePart[] }[]): string[] {
  const keys = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const used = new Map<string, number>();
    for (const part of message.parts) {
      if (part.type !== 'data-action-proposal') continue;
      const data = part.data as { tool?: string; idempotency_key?: string } | undefined;
      if (!data?.tool || !data.idempotency_key) continue;
      const index = used.get(data.tool) ?? 0;
      used.set(data.tool, index + 1);
      const call = message.parts.filter((p) => p.type === `tool-${data.tool}`)[index];
      const approval = call?.approval as { approved?: boolean } | undefined;
      if (call?.state === 'output-denied' || (call?.state === 'approval-responded' && approval?.approved === false)) keys.add(data.idempotency_key);
    }
  }
  return [...keys];
}
