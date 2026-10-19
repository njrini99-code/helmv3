'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { GateLoading } from '../auth/GateLoading';
import { browserCoachGuard, resolveCoachEntry, type CoachEntry, type CoachGuardDeps } from './coach-guard';
import { Onboard } from './Onboard';

/**
 * /golf/coach in Clubhouse: the new head coach's questions (the program, the profile, the code to share), after the
 * same check today's page makes of who may see them (`coach-guard.ts`). The questions are the sign-up flow's own
 * (`Onboard`, `CoachSteps`): one at a time on the pane, with the coach's member card filling in beside them.
 */
export function CoachOnboard({ deps, entry: given }: { deps?: CoachGuardDeps; /** The preview and the tests start from a known answer. */ entry?: CoachEntry }) {
  const router = useRouter();
  const [entry, setEntry] = useState<CoachEntry | null>(given ?? null);

  useEffect(() => {
    if (given) return;
    let live = true;
    void resolveCoachEntry(deps ?? browserCoachGuard()).then((r) => live && setEntry(r));
    return () => {
      live = false;
    };
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (entry?.kind === 'go') router.replace(entry.to);
  }, [entry, router]);

  // CH-15953: until it is known who is here, the sign-in room holds the place (the pane would otherwise flash for a
  // coach who belongs elsewhere, and be taken away).
  if (!entry || entry.kind === 'go') return <GateLoading label="Setting up your program" title="Set up your program" line="Checking your account…" />;
  return <Onboard start="cprogram" seed={{ intent: 'program', accountMade: true, first: entry.seed.first, last: entry.seed.last, email: entry.seed.email }} />;
}
