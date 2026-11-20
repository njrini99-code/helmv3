/**
 * The GolfHelm mark as a vector (HL-7): the helm wheel around a golf ball, drawn from the 116px PNG it replaces
 * (public/clubhouse/auth/helm-golf-mark.png) on the same geometry, so it stays sharp at every size it is shown (20 to
 * 46px, at 3x on an iPhone). Decorative: the name beside it is the text.
 */
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315];
const DIMPLES: Array<[number, number]> = [
  [49, 40], [58, 38], [67, 41], [45, 47], [54, 46], [63, 47], [71, 50], [42, 55], [51, 54], [60, 55], [69, 57], [48, 62], [57, 63], [66, 63],
];
const CUP = [30, 50, 70, 90, 110, 130, 150];

export function HelmMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={'ch-helm-mark' + (className ? ` ${className}` : '')} width={size} height={size} viewBox="0 0 116 116" aria-hidden="true" focusable="false">
      <g stroke="#1f9240" strokeLinecap="round" strokeWidth="11">
        {SPOKES.map((a) => {
          const t = (a * Math.PI) / 180;
          return <line key={a} x1={58 + 42 * Math.cos(t)} y1={58 + 42 * Math.sin(t)} x2={58 + 52 * Math.cos(t)} y2={58 + 52 * Math.sin(t)} />;
        })}
      </g>
      <circle cx="58" cy="58" r="37" fill="#fff" stroke="#1f9240" strokeWidth="11" />
      {/* The ball sits in a green cup: a green disc, the white ball raised in it, the cup's dimples as white dashes. */}
      <circle cx="58" cy="59" r="25.5" fill="#1f9240" />
      <circle cx="58" cy="55" r="23" fill="#fff" />
      <g fill="#fff">
        {CUP.map((a) => {
          const t = (a * Math.PI) / 180;
          return <circle key={a} cx={58 + 21 * Math.cos(t)} cy={62 + 18.5 * Math.sin(t)} r="1.6" />;
        })}
      </g>
      <g fill="#1f9240">
        {DIMPLES.map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="2.6" />
        ))}
      </g>
    </svg>
  );
}
