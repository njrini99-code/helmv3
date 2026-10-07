'use client';

import { useEffect, useRef, useState } from 'react';
import { generateRoundRecap } from '@/app/golf/actions/round-recap';

/**
 * The round's AI recap, generated AFTER mount when none is persisted yet.
 *
 * The round detail page used to call `generateRoundRecap` while the Server
 * Component rendered, so any render of the route (an RSC fetch included) could
 * spend an LLM call and write `golf_rounds.ai_recap` (audit DATA-04). The page
 * now only READS the persisted recap and passes `pending` when a completed
 * round has none; this hook asks for it once, from the browser of a viewer who
 * actually opened the round.
 *
 * `generateRoundRecap` is idempotent on the server (it returns the persisted
 * recap when one exists, and a single-flight lock stops two concurrent callers
 * from both generating), so the ref below is about not ASKING twice from one
 * mounted screen, e.g. React StrictMode's double effect in development. It is
 * keyed on the round id and deliberately never reset in cleanup: resetting it
 * is exactly what would let the second StrictMode pass fire a second request.
 */
export function useDeferredRoundRecap(
  roundId: string,
  initialRecap: string | null,
  pending: boolean,
): { recap: string | null; generating: boolean } {
  const [recap, setRecap] = useState<string | null>(initialRecap);
  const [generating, setGenerating] = useState<boolean>(pending && !initialRecap);
  const requestedFor = useRef<string | null>(null);

  // A new round (client navigation between two rounds reuses this instance)
  // starts from its own persisted value.
  useEffect(() => {
    setRecap(initialRecap);
    setGenerating(pending && !initialRecap);
  }, [roundId, initialRecap, pending]);

  useEffect(() => {
    if (!pending || initialRecap) return;
    if (requestedFor.current === roundId) return;
    requestedFor.current = roundId;

    let active = true;
    generateRoundRecap(roundId)
      .then((result) => {
        if (active && result.recap) setRecap(result.recap);
      })
      .catch(() => {
        // Non-fatal: the recap is additive. The action logs its own failures;
        // the next visit asks again because nothing was persisted.
      })
      .finally(() => {
        if (active) setGenerating(false);
      });
    return () => {
      active = false;
    };
  }, [roundId, initialRecap, pending]);

  return { recap, generating };
}
