'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { chTrail } from '../../lib/track';
import { haptic } from '../../lib/haptics';
import type { ChRole } from '../nav';
import type { ChRecent } from './commands';
import { setPeopleScope, usePeople } from './people';
import { Palette } from './Palette';
import { noteVisit, readRecent } from './recent';
import { ShortcutsSheet } from './ShortcutsSheet';
import { interpretKey, isApple, isInOverlay, isTypingTarget, itemForLetter, modalOpen, pageSearchField, type ChKeyOutcome } from './shortcuts';

/** The command layer is for a keyboard and a pointer that hovers, on the desktop layout; the phone has none of it. */
const DESKTOP = '(hover: hover) and (min-width: 821px)';

function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(DESKTOP);
      mql.addEventListener('change', cb);
      return () => mql.removeEventListener('change', cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

/**
 * Desktop keyboard layer, mounted once in the frame: Cmd or Ctrl K opens the command palette, G then a letter goes to a
 * section, `/` focuses the page's search field and `?` shows the shortcuts. Nothing is listened for on a phone.
 *
 * It also remembers the sections the person has been in (the palette's Recent) and hands the roster a place to publish
 * the players it has already loaded (people.ts). Its keys never fire while typing in a field or inside a dialog, a
 * menu or a list (shortcuts.ts); the sidebar's Cmd or Ctrl \ and Home's N keep their own handlers.
 */
export function CommandLayer({ role, pathname, userId, teamId }: { role: ChRole; pathname: string; userId: string; teamId: string | null }) {
  const router = useRouter();
  const desktop = useDesktop();
  const people = usePeople();
  const [palette, setPalette] = useState(false);
  const [opens, setOpens] = useState(0);
  const [help, setHelp] = useState(false);
  // Held after the first opening, so a dialog closing keeps its exit; never drawn before it is first used.
  const [used, setUsed] = useState({ palette: false, help: false });
  const [recent, setRecent] = useState<ChRecent[]>([]);
  const armed = useRef<number | null>(null);
  const live = useRef({ palette, help, role });
  live.current = { palette, help, role };

  useEffect(() => setPeopleScope(teamId), [teamId]);
  useEffect(() => {
    setRecent(noteVisit(userId, role, pathname));
  }, [userId, role, pathname]);

  const openPalette = useCallback(() => {
    // The latest list, read when it opens: a section visited since is already in it.
    setRecent(readRecent(userId));
    setOpens((n) => n + 1);
    setUsed((u) => ({ ...u, palette: true }));
    setPalette(true);
    chTrail('command palette open');
  }, [userId]);

  useEffect(() => {
    if (!desktop) return;
    const onKey = (e: KeyboardEvent) => {
      const chord = (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
      // Cmd K again closes the palette (it is the one dialog the chord works over).
      if (chord && live.current.palette) {
        e.preventDefault();
        setPalette(false);
        return;
      }
      const result = interpretKey(
        e,
        { typing: isTypingTarget(e.target), overlay: isInOverlay(e.target) || modalOpen(document) },
        armed.current,
        performance.now(),
      );
      armed.current = result.armedAt;
      act(result.outcome, e);
    };
    const act = (o: ChKeyOutcome, e: KeyboardEvent) => {
      switch (o.kind) {
        case 'palette':
          e.preventDefault();
          openPalette();
          break;
        case 'help':
          e.preventDefault();
          setUsed((u) => ({ ...u, help: true }));
          setHelp(true);
          break;
        case 'search': {
          const field = pageSearchField(document.getElementById('ch-canvas') ?? document);
          if (!field) break;
          e.preventDefault();
          field.focus();
          field.select();
          break;
        }
        case 'go': {
          const item = itemForLetter(live.current.role, o.letter);
          if (!item) break;
          e.preventDefault();
          haptic('select');
          chTrail('command go (keyboard)', { to: item.id });
          router.push(item.href, { scroll: false });
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [desktop, openPalette, router]);

  if (!desktop) return null;
  const apple = isApple(typeof navigator === 'undefined' ? undefined : navigator);
  return (
    <>
      {used.palette && <Palette open={palette} onClose={() => setPalette(false)} role={role} pathname={pathname} people={people} recent={recent} keyword={opens} />}
      {used.help && <ShortcutsSheet open={help} onClose={() => setHelp(false)} role={role} apple={apple} />}
    </>
  );
}
