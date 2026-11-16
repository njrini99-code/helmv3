'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { getEventEditorInputs, type ChEventEditorInputs } from '../../data/event-editor-inputs';
import type { ChCalType } from '../calendar/model';
import type { EditorSeed } from '../calendar/editor';
import { useBusy } from '../../lib/use-busy';
import { chTrail } from '../../lib/track';

const loadEditor = () => import('./HomeEventEditor').then((m) => m.HomeEventEditor);
const HomeEventEditor = dynamic(loadEditor, { ssr: false });

/**
 * Home's Add event and its quick type chips (production audit 2026-11-15, MAC-03): the event editor opens here, on Home,
 * instead of leaving for Calendar just to open a sheet. A press starts the editor's code and its inputs (the week's events
 * and the roster, read for the signed-in coach); the click opens the sheet once both are in, and the busy beat covers any
 * wait (nothing for 150 ms). With no inputs (not a coach, a failed read) it goes to Calendar's `?new=1` as before, and a
 * modified click or a middle click keeps the link's own behaviour.
 */
export function NewEventLink({ href, type, className, onTap, children }: { href: string; type?: ChCalType; className: string; onTap?: () => void; children: ReactNode }) {
  const router = useRouter();
  const inputs = useRef<Promise<ChEventEditorInputs | null> | null>(null);
  const [open, setOpen] = useState<{ seed: EditorSeed; inputs: ChEventEditorInputs } | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useBusy(pending);

  const warm = useCallback(() => {
    inputs.current ??= getEventEditorInputs().catch(() => null);
    void loadEditor();
    return inputs.current;
  }, []);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (pending) return;
    onTap?.();
    chTrail('home new event', { type: type ?? 'any' });
    setPending(true);
    void Promise.all([warm(), loadEditor()]).then(([got]) => {
      setPending(false);
      if (!got) {
        inputs.current = null;
        router.push(href);
        return;
      }
      // The seed is made once per opening: the editor fills its form from it, so a later render must not hand it a new one.
      setOpen({ seed: { event: null, type }, inputs: got });
    });
  };

  return (
    <>
      <Link href={href} className={className} data-ch-press="" aria-busy={busy === 'skeleton' || undefined} onPointerDown={warm} onFocus={warm} onClick={onClick}>
        {children}
      </Link>
      {open && (
        <HomeEventEditor
          seed={open.seed}
          inputs={open.inputs}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            // The next open reads the week again, so the new event is in its conflicts.
            inputs.current = null;
            router.refresh();
          }}
        />
      )}
    </>
  );
}
