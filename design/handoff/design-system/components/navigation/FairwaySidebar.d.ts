export interface SidebarItem { id: string; label: string; icon?: string; count?: number; section?: string }
export interface FairwaySidebarProps {
  items: SidebarItem[];
  current?: string;
  onNavigate?: (id: string) => void;
  user?: { name: string; meta?: string; initials?: string };
  /** Plain-type product name (no logo asset exists). */
  product?: string;
  /** Team / program line under the product name, with a switcher glyph: "Varsity · Fall 2026". */
  team?: React.ReactNode;
  /** green = Augusta clubhouse (default); ivory = light shell. */
  tone?: 'green' | 'ivory';
  /** Replaces the product name — pass a real logo here when available. */
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function FairwaySidebar(props: FairwaySidebarProps): JSX.Element;
