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


/**
 * Claim the HEADER, but not the whole screen.
 *
 * `useImmersiveSurface` above is for a destination that owns everything — an
 * open conversation — and it takes the bottom tab bar with it. An inbox is not
 * that: you still need to leave it, so the tab bar stays.
 *
 * What it does take is the two bands stacked above it. Measured on a 390px
 * viewport, the messages inbox put its first conversation row 255px down an
 * 844px screen — 30% of the device — behind the shell top bar (64px), the hub
 * sub-nav (39px), a search field and a scope row, in three different visual
 * languages. Two of those four bands are shell chrome the page cannot restyle,
 * which is why the screen reads as assembled rather than designed.
 *
 * A surface that takes this on is promising to draw its own masthead. It is
 * not a way to save pixels; it is a trade — the page owes the destination's
 * name and anything the bar was carrying (the notification bell) back to the
 * user, in one band instead of two.
 */
let headerlessClaims = 0;

export function useHeaderlessSurface(active: boolean): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    headerlessClaims += 1;
    document.body.setAttribute('data-fw-headerless', '');

    return () => {
      headerlessClaims = Math.max(0, headerlessClaims - 1);
      if (headerlessClaims === 0) document.body.removeAttribute('data-fw-headerless');
    };
  }, [active]);
}
