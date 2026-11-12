import { DEFAULT_BODY_PX, MAX_BODY_PX, MIN_BODY_PX } from '../lib/type-scale';

/**
 * Clubhouse's type scale before first paint (P008-C1). The server cannot know the iPhone's Text Size, so it renders every
 * page at scale 1; lib/dynamic-type.ts then read `-apple-system-body` in a layout effect at hydration and every word on the
 * page grew or shrank at once, on each cold load, for anyone off the default Text Size (phone premium sweep, 12 Nov 2026:
 * at the smallest size an h1 went 34 to 28px and Tournaments 1734 to 1210px tall in one frame).
 *
 * This runs in the root <head>, for the reason SkyScript does (a nested layout's script never runs on a soft navigation),
 * reads the same font the same way, and stamps the same `--ch-type-scale` on <html> that the hook will write, so hydration
 * changes nothing. The maths mirror typeScaleFor and typeScaleValue (lib/type-scale.ts); type-scale-script.test.ts runs
 * this script against them. Only where the Clubhouse frame mounts the hook: the dashboard and the preview. The token reads
 * it only under [data-ui='clubhouse'], so a Fairway dashboard is untouched.
 */
export const TYPE_SCALE_BOOT =
  '(function(){try{var p=location.pathname;' +
  "if(!(p==='/golf/dashboard'||p.indexOf('/golf/dashboard/')===0||p.indexOf('/clubhouse-preview')===0))return;" +
  "if(!window.matchMedia||!window.matchMedia('(pointer: coarse)').matches)return;" +
  "var r=document.documentElement,e=document.createElement('span');e.style.font='-apple-system-body';if(!e.style.font)return;" +
  'r.appendChild(e);var s=parseFloat(getComputedStyle(e).fontSize);r.removeChild(e);' +
  `if(!isFinite(s)||s===${DEFAULT_BODY_PX})return;` +
  `var k=Math.max(${MIN_BODY_PX}/${DEFAULT_BODY_PX},Math.min(${MAX_BODY_PX}/${DEFAULT_BODY_PX},s/${DEFAULT_BODY_PX}));` +
  "r.style.setProperty('--ch-type-scale',String(Math.round(k*1000)/1000))}catch(x){}})();";

export function TypeScaleScript() {
  return <script dangerouslySetInnerHTML={{ __html: TYPE_SCALE_BOOT }} />;
}
