export interface IconProps {
  /** Lucide icon name, kebab or Pascal case: "flag", "chevron-right", "CalendarDays". */
  name: string;
  /** Pixel size. 14 inline, 16 controls, 18–20 nav. */
  size?: number;
  /** 1.6 default; 1.4 at 20px+, 1.8 at 14px. */
  strokeWidth?: number;
  /** Accessible label. Omit for decorative icons (aria-hidden). */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}
export declare function Icon(props: IconProps): JSX.Element;
