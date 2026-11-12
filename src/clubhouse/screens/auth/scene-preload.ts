import type { GolfScene } from './GolfScene';

/**
 * The painted course, when its chunk is already here: the landing page fetches it while idle (ScenePreload), and the
 * sign in then renders it directly, in the route's first frame, with no fade-in. Through next/dynamic it went through a
 * Suspense fallback first even with the chunk loaded, so the daytime still under it showed for a beat (WebKit film,
 * 2026-11-12: 110ms, then the course). A module value, so the landing's preload and the sign in's SceneMount share it.
 */
let scene: typeof GolfScene | null = null;

export function preloadedScene(): typeof GolfScene | null {
  return scene;
}

export function markScenePreloaded(mod: { GolfScene: typeof GolfScene }): void {
  scene = mod.GolfScene;
}
