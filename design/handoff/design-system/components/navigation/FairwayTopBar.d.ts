export interface FairwayTopBarProps {
  crumbs?: React.ReactNode[];
  actions?: React.ReactNode;
  onSearch?: () => void;
  searchPlaceholder?: string;
  className?: string;
}
export declare function FairwayTopBar(props: FairwayTopBarProps): JSX.Element;
