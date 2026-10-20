export interface DriveShot { /** Yards left (−) or right (+) of the target line. */ x: number; /** Carry in yards. */ y: number }
export interface DriveDispersionProps {
  shots: DriveShot[];
  /** Fairway width in yards. */
  fairway?: number;
  /** Half-width of the plot in yards. */
  lateral?: number;
  /** Carry range shown, yards. */
  range?: [number, number];
  title?: React.ReactNode;
  meta?: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}
export declare function DriveDispersion(props: DriveDispersionProps): JSX.Element;
