import type { CSSProperties, SVGProps } from 'react';

/**
 * Text in a drawing, sized in the drawing's own viewBox units (SYS-6). A --ch-type-* token scales with iPhone Text Size while the
 * drawing does not, so the words outgrew the chart's padding; these scale with the drawing and nothing else. Set `size` for the phone's
 * width: the 12px floor is on the screen, so a viewBox drawn at 0.8 needs a `size` of 15.
 */
export function ChartText({ size, weight = 500, style, children, ...rest }: Omit<SVGProps<SVGTextElement>, 'fontSize' | 'fontWeight'> & { size: number; weight?: 500 | 600 | 700 }) {
  const fixed: CSSProperties = { font: 'inherit', fontSize: `${size}px`, fontWeight: weight, lineHeight: 1, ...style };
  return (
    <text {...rest} style={fixed}>
      {children}
    </text>
  );
}
