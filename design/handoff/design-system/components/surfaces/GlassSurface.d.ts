export interface GlassSurfaceProps {
  /** 88% tint for text-heavy content over imagery. */
  strong?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function GlassSurface(props: GlassSurfaceProps): JSX.Element;
