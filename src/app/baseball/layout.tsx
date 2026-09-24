import { baseballFontVariables, rootFontVariablesCss } from '@/lib/fonts';
import { LEGACY_SPORT_TOKENS_CSS } from '@/lib/legacy-sport-tokens';

/**
 * BaseballHelm root segment layout: loads the BaseballHelm-only web fonts.
 *
 * The app root layout registers no web fonts (GolfHelm renders entirely in
 * the Apple SF system stack). BaseballHelm's "Living Annual" faces live here
 * instead, so they are preloaded on /baseball/** only:
 *   - Space Grotesk → `font-annual` (names, hero numerals, stat figures)
 *   - Fraunces      → `font-serif`  (editorial eyebrows, dialog titles)
 *   - Geist Mono    → `font-mono`   (code-like identifiers)
 *
 * The variables are declared on :root (not on a wrapper element) so dialogs,
 * popovers and toasts that Radix portals into <body> still resolve them.
 */
// Font variables, then the pre-contrast-pass Fairway token values (OD-17:
// the GolfHelm redesign does not change how this sport looks).
const fontVariablesCss = rootFontVariablesCss(baseballFontVariables) + LEGACY_SPORT_TOKENS_CSS;

export default function BaseballLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: fontVariablesCss }} />
      {children}
    </>
  );
}
