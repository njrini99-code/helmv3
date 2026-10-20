export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  /** Renders a paragraph of N lines with a short last line. */
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Skeleton(props: SkeletonProps): JSX.Element;
