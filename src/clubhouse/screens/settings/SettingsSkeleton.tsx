import { Skeleton } from '../../ui/States';
import '../../styles/settings.css';

/** Route skeleton: the header, the rail and two cards, in the page's own geometry. */
export function SettingsSkeleton() {
  return (
    <main className="ch-set" aria-busy="true" aria-label="Loading settings">
      <header className="ch-set-head">
        <Skeleton width={170} height={40} radius={10} />
        <Skeleton width={260} height={13} />
      </header>
      <div className="ch-set-layout">
        <div className="ch-set-rail ch-set-skel-rail" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ch-set-rail__i">
              <Skeleton width={16} height={16} radius={5} />
              <span style={{ display: 'grid', gap: 6, flex: 1 }}>
                <Skeleton width="60%" height={13} />
                <Skeleton width="85%" height={10} />
              </span>
            </div>
          ))}
        </div>
        <div className="ch-set-stack" aria-hidden>
          {[3, 2].map((rows, i) => (
            <div key={i} className="ch-surface">
              <div className="ch-surface__head">
                <div style={{ display: 'grid', gap: 8 }}>
                  <Skeleton width={140} height={15} />
                  <Skeleton width={280} height={11} />
                </div>
              </div>
              <div className="ch-surface__body ch-set-stackbody">
                {Array.from({ length: rows }, (_, r) => (
                  <div key={r} className="ch-set-row">
                    <div className="ch-set-row__txt" style={{ display: 'grid', gap: 6 }}>
                      <Skeleton width={150} height={12} />
                      <Skeleton width={230} height={10} />
                    </div>
                    <Skeleton width={40} height={23} radius={999} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
