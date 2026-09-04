'use client';

import { useEffect } from 'react';

/**
 * Claim the whole screen for a focused destination.
 *
 * While active this sets `data-fw-immersive` on `<body>`, which globals.css
 * reads to hide the mobile bottom-tab bar AND collapse the padding AppShell
 * reserves for it. Both, together — hiding the bar while its 56px reservation
 * stayed would swap a useful bar for dead space.
 *
 * The case it exists for is an open conversation. A group chat competing with a
 * global tab bar is the "card inside a page" problem in navigation form: the
 * thread is the entire task, and five other destinations pinned beneath it are
 * noise occupying the scarcest space on the device.
 *
 * Deliberately NOT tied to the keyboard. A bar that vanishes when you focus the
 * composer and returns when you blur it is more distracting than one that never
 * moves; this is scoped to the destination, for as long as the user is in it.
 *
 * Reference-counted, because more than one surface can legitimately ask at once
 * (a conversation open behind a sheet that also wants the screen). The attribute
 * is removed only when the last claim is released, so an unmount cannot strand
 * the app with a hidden tab bar — the failure mode that would make this
 * unshippable.
 */
let claims = 0;

export function useImmersiveSurface(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    claims += 1;
    document.body.setAttribute('data-fw-immersive', '');

    return () => {
      claims = Math.max(0, claims - 1);
      if (claims === 0) document.body.removeAttribute('data-fw-immersive');
    };
  }, [active]);
}
