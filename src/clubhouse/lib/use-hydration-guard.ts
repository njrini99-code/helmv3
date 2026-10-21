'use client';

import { useHydrated } from './use-hydrated';

/**
 * The props that keep a text box from taking input it would lose.
 *
 * Text typed into server HTML before React hydrates it is reset when the controlled value is applied, and WebKit drops the
 * first-typed box (a name typed straight after load saved the last name and not the first; a wiped email or password at
 * sign in is the same loss). Until hydration is done the box is read-only, so a person or a test waits for it instead of
 * typing into a box that is about to be reset. Spread the result onto the `<input>` after its own props:
 *
 *     const guard = useHydrationGuard(props.readOnly);
 *     <input {...props} {...guard} />
 *
 * `data-ch-hydrating` lets a style keep the box looking editable meanwhile (`.ch-input[readonly][data-ch-hydrating]` in
 * `controls.css`); the sign-in boxes carry no read-only look, so they need none. A box that is read-only on purpose stays
 * so: pass its `readOnly`.
 */
export function useHydrationGuard(readOnly?: boolean): { readOnly: boolean; 'data-ch-hydrating': '' | undefined } {
  const hydrated = useHydrated();
  return { readOnly: !!readOnly || !hydrated, 'data-ch-hydrating': hydrated ? undefined : '' };
}
