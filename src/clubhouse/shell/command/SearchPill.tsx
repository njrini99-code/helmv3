'use client';

import { Search } from 'lucide-react';
import { Icon } from '../../ui/Icon';
import { Keys } from './Keys';
import { openCommandPalette, useCommandDesktop } from './palette-open';
import { isApple, modKey } from './shortcuts';

/**
 * The top bar's search (B11): a key drawn as a search field, with the palette's chord beside it, that opens the one command
 * palette (CommandLayer) the way Cmd or Ctrl K does. Desktop only, where the command layer runs: drawn once on the client,
 * so the chord is the platform's own (the Command key on a Mac) and the server never renders a key nothing would answer.
 */
export function SearchPill() {
  const desktop = useCommandDesktop();
  if (!desktop) return null;
  const apple = isApple(navigator);
  return (
    <button
      type="button"
      className="ch-topbar__search"
      aria-haspopup="dialog"
      aria-keyshortcuts={apple ? 'Meta+K' : 'Control+K'}
      onClick={(e) => {
        // Safari doesn't focus a button it clicks, so the palette's dialog would hand focus back to the page on Esc.
        e.currentTarget.focus({ preventScroll: true });
        openCommandPalette();
      }}
    >
      <Icon icon={Search} size={15} />
      {/* F-0011 (WCAG 2.5.3): named by the word it shows, Search, then what it searches; an aria-label left out the key caps beside it. */}
      <span className="ch-topbar__search-t">Search</span>{' '}
      <span className="ch-sr-only">Clubhouse</span>
      <Keys keys={[modKey(apple), 'K']} />
    </button>
  );
}
