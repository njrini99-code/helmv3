'use client';

const WIDTHS: Record<string, number[]> = {
  headline: [40, 70],
  kpis: [30, 30, 30],
  trend: [100, 100, 60],
  ranking: [90, 70, 50, 30],
  bands: [80, 60, 45, 30],
  split: [60, 40],
  compare: [90, 90],
  note: [90, 60],
};

/** While `show_visual` is on its way: a skeleton shaped by the blocks already named. Nothing is drawn as a figure until the composition lands (AK3). */
export function ToolSkeleton({ types }: { types: string[] }) {
  const list = types.length ? types : ['trend'];
  return (
    <div className="vcard is-skel" aria-hidden="true" data-ch-ask-skel={list.join(',')}>
      {list.map((t, i) => (
        <div key={`${t}-${i}`} className="sk">
          {(WIDTHS[t] ?? [90, 60]).map((w, j) => (
            <i key={j} style={{ width: `${w}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}
