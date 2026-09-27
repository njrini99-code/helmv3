import { baseballFontVariables, rootFontVariablesCss } from '@/lib/fonts';
import { LEGACY_SPORT_TOKENS_CSS } from '@/lib/legacy-sport-tokens';

/**
 * Lift Lab root segment layout: loads the web fonts Lift Lab renders with.
 *
 * The app root layout registers no web fonts (GolfHelm renders in the Apple
 * SF system stack). Lift Lab reuses BaseballHelm's "Living Annual" primitives
 * and kept the Geist sans it had before, so it declares the same font
 * variables as src/app/baseball/layout.tsx — Lift Lab looks exactly as it did
 * (owner OD-17: Baseball and Lift Lab are not part of the golf redesign).
 */
// Font variables, then the pre-contrast-pass Fairway token values (OD-17:
// the GolfHelm redesign does not change how this sport looks).
const fontVariablesCss = rootFontVariablesCss(baseballFontVariables) + LEGACY_SPORT_TOKENS_CSS;

export default function LiftingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: fontVariablesCss }} />
      {children}
    </>
  );
}
