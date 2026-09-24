import { baseballFontVariables, rootFontVariablesCss } from '@/lib/fonts';

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
const fontVariablesCss = rootFontVariablesCss(baseballFontVariables);

export default function BaseballLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: fontVariablesCss }} />
      {children}
    </>
  );
}
