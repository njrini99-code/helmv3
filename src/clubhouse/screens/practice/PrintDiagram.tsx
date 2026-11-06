export type DrillDiagramKind = 'auto' | 'none' | 'rings' | 'gate' | 'ladder' | 'landing' | 'targets';

/** `auto` picks by area (N-00 4.14). A range drill with no preset of its own draws none, rather than a picture that isn't the drill. */
export function diagramFor(kind: DrillDiagramKind, area: string | null): Exclude<DrillDiagramKind, 'auto'> {
  if (kind !== 'auto') return kind;
  if (area === 'putting') return 'rings';
  if (area === 'short_game' || area === 'bunker') return 'landing';
  if (area === 'approach') return 'targets';
  return 'none';
}

const Flag = ({ x, y }: { x: number; y: number }) => (
  <g>
    <line x1={x} y1={y} x2={x} y2={y - 24} />
    <path d={`M${x} ${y - 24}l12 4.5-12 4.5z`} className="f" />
  </g>
);

/** The set-up, in ink only: one light surface, ink lines and marks, so it copies in black and white. */
export function DrillDiagram({ kind }: { kind: Exclude<DrillDiagramKind, 'auto'> }) {
  if (kind === 'none') return null;
  return (
    <svg className="ch-prt-dia" viewBox="0 0 240 96" role="img" aria-label={`Set-up: ${kind}`}>
      {kind === 'rings' && (
        <>
          <circle cx="120" cy="48" r="44" className="s" />
          <circle cx="120" cy="48" r="30" />
          <circle cx="120" cy="48" r="16" />
          <circle cx="120" cy="48" r="3" className="f" />
        </>
      )}
      {kind === 'gate' && (
        <>
          <rect x="16" y="16" width="208" height="64" rx="6" className="s" />
          <line x1="150" y1="36" x2="170" y2="36" />
          <line x1="150" y1="60" x2="170" y2="60" />
          <circle cx="60" cy="48" r="3" className="f" />
          <line x1="68" y1="48" x2="190" y2="48" strokeDasharray="4 4" />
          <circle cx="204" cy="48" r="4" className="f" />
        </>
      )}
      {kind === 'ladder' && (
        <>
          <rect x="16" y="16" width="208" height="64" rx="6" className="s" />
          {[60, 100, 140, 180].map((x) => (
            <line key={x} x1={x} y1="24" x2={x} y2="72" />
          ))}
          <circle cx="30" cy="48" r="3" className="f" />
        </>
      )}
      {kind === 'landing' && (
        <>
          <rect x="16" y="16" width="208" height="64" rx="6" className="s" />
          <circle cx="130" cy="52" r="16" strokeDasharray="4 4" />
          <circle cx="34" cy="52" r="3" className="f" />
          <Flag x={196} y={64} />
        </>
      )}
      {kind === 'targets' && (
        <>
          <rect x="16" y="16" width="208" height="64" rx="6" className="s" />
          <Flag x={70} y={70} />
          <Flag x={128} y={56} />
          <Flag x={186} y={44} />
        </>
      )}
    </svg>
  );
}
