import { Skeleton } from '../../ui/States';
import '../../styles/messages.css';

/** Route loading for Messages: the rail's head and rows, and an empty thread column, in place. */
export function MessagesSkeleton() {
  return (
    <main className="ch-ms" aria-busy="true" aria-label="Loading messages">
      <aside className="ch-ms-rail">
        <div className="ch-ms-rail__head">
          <Skeleton width={150} height={30} radius={8} />
          <Skeleton width="100%" height={36} radius={10} />
          <Skeleton width="100%" height={32} radius={11} />
        </div>
        <div className="ch-ms-rail__body">
          <div className="ch-ms-sec__card">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="ch-ms-row" style={{ cursor: 'default' }}>
                <Skeleton width={36} height={36} radius={18} />
                <span style={{ display: 'grid', gap: 7 }}>
                  <Skeleton width="60%" height={13} />
                  <Skeleton width="85%" height={12} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </aside>
      <section className="ch-ms-thread">
        <div className="ch-ms-th">
          <Skeleton width={220} height={38} radius={19} />
        </div>
      </section>
    </main>
  );
}
