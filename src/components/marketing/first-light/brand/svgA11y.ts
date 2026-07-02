/**
 * Shared accessibility contract for the brand SVG icon family (HelmMark,
 * HelmRosette, SportGlyph). Decorative by default — `aria-hidden` +
 * `focusable="false"` (the latter kills the old-Edge/IE11 "SVGs are
 * keyboard-focusable by default" quirk) — and becomes a labeled image
 * (`role="img"` + `aria-label` + a `<title>` child the caller renders)
 * only when a `title` is supplied.
 */
export interface SvgA11yInput {
  title?: string;
}

export interface SvgA11yProps {
  role?: 'img';
  'aria-hidden'?: boolean;
  'aria-label'?: string;
  focusable: 'false';
}

export function getSvgA11yProps({ title }: SvgA11yInput): SvgA11yProps {
  if (title) {
    return { role: 'img', 'aria-label': title, focusable: 'false' };
  }
  return { 'aria-hidden': true, focusable: 'false' };
}
