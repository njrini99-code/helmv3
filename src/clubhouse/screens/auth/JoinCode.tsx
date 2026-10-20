'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { haptic } from '../../lib/haptics';
import { CODE_SLOTS } from '../onboard/logic';
import { AuthNotice } from './AuthNotice';
import { CodeField } from './CodeField';
import { GateFrame, useGateView } from './GateFrame';
import { GateKey } from './gate-fields';
import { codeFromEntry, joinCodeProblem } from './join-state';

const ERROR_ID = 'golf-join-error';
const HINT_ID = 'golf-join-hint';

/**
 * /golf/join in Clubhouse: a team code, and nothing else. Today's page (`src/app/golf/join/page.tsx`) asks the same
 * thing and does the same with the answer: it takes the code to `/golf/join/<code>`, where the server resolves it, so
 * the code is never judged here. The boxes fill as it is typed or pasted, and a pasted invite link gives up its code.
 */
export function JoinCode({ initialCode = '', initialProblem = false, navigate }: { initialCode?: string; /** The preview draws the refusal without a press. */ initialProblem?: boolean; navigate?: (href: string) => void } = {}) {
  const router = useRouter();
  const { view, dir, stageRef } = useGateView('code');
  const [code, setCode] = useState(initialCode);
  const [problem, setProblem] = useState(initialProblem ? joinCodeProblem(initialCode) : null);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  // False until the client has mounted: the form is in the server HTML, so a tap or a keystroke can land before React is
  // listening. What was typed is taken up at mount, and the key waits (as sign in's does, #1245), so Enter never submits
  // the page natively and never loses what was typed.
  const [hydrated, setHydrated] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const typed = input.current?.value;
    if (typed) setCode((c) => c || codeFromEntry(typed));
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (nonce > 0) input.current?.focus();
  }, [nonce]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (busy || !hydrated) return;
    const found = joinCodeProblem(code);
    if (found) {
      // CH-15703 a refusal about the field: warned, marked, focused, shaken once.
      haptic('warning');
      setProblem(found);
      setNonce((n) => n + 1);
      return;
    }
    haptic('press');
    setBusy(true);
    const href = `/golf/join/${code}`;
    if (navigate) navigate(href);
    else router.push(href);
  };

  const shake = nonce > 0 && problem ? (nonce % 2 ? 'a' : 'b') : undefined;
  const filled = code.length >= CODE_SLOTS;

  return (
    <GateFrame label="Join a team" say={{ title: 'Find your team.', line: 'A code from your coach is all it takes' }} back={{ href: '/golf', label: 'Home' }} viewKey={view} dir={dir} stageRef={stageRef}>
      <form className="ch-au-form" onSubmit={submit} noValidate aria-label="Join a team" data-ch-code="CH-15933">
        <h1>Join a team</h1>
        <p className="ch-au-sub">Enter the code your coach gave you. Letters and numbers, in any case.</p>
        <div className="ch-au-fields" data-shake={shake} data-ch-code={shake ? 'CH-15609' : undefined}>
          <CodeField
            id="golf-join-code"
            value={code}
            onChange={(c) => {
              setCode(c);
              if (problem) setProblem(null);
            }}
            invalid={!!problem}
            describedBy={problem ? ERROR_ID : HINT_ID}
            inputRef={input}
            // eslint-disable-next-line jsx-a11y/no-autofocus -- the one task on this screen
            autoFocus
          />
        </div>
        {problem ? (
          <div className="ch-au-err" key={nonce}>
            <AuthNotice tone="danger" id={ERROR_ID} code={problem.code}>
              {problem.message}
            </AuthNotice>
          </div>
        ) : (
          <p className="ch-au-hint" id={HINT_ID} aria-live="polite">
            {code.length === 0 ? 'Paste it or type it. A link your coach sent works too.' : filled ? 'Press Continue to see the team.' : `${code.length} of ${CODE_SLOTS} characters`}
          </p>
        )}
        <GateKey idle="Continue" working="Opening…" busy={busy} disabled={!hydrated} code="CH-15436" />
        <p className="ch-au-alt">
          No code? Ask your coach for the team code.
        </p>
      </form>
    </GateFrame>
  );
}
