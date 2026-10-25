/**
 * The iPhone app's launch splash comes down as soon as the server's page has painted (A15), not once the app's script has
 * loaded and React has hydrated (CapacitorProvider's hideSplashScreen, which stays as the fallback). The native bridge
 * is in the page from its first byte, so this inline script reaches the SplashScreen plugin through it, two frames after
 * it runs: the first frame with the page on it. In a browser there is no bridge and it does nothing.
 */
const HIDE = `(function(){try{var c=window.Capacitor;if(!c||!c.isNativePlatform||!c.isNativePlatform()||!c.nativePromise)return;requestAnimationFrame(function(){requestAnimationFrame(function(){c.nativePromise('SplashScreen','hide',{fadeOutDuration:250}).catch(function(){});});});}catch(e){}})();`;

export function SplashHide() {
  return <script dangerouslySetInnerHTML={{ __html: HIDE }} suppressHydrationWarning />;
}

export const SPLASH_HIDE_SCRIPT = HIDE;
