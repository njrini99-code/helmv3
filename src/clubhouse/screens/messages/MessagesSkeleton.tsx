import { Skeleton } from '../../ui/States';
import '../../styles/messages.css';

/**
 * Route loading for Messages: the rail's head and rows, and an empty thread column, in place. On the phone it is the
 * inbox's own shape instead (Search, the filters, a section under its double rule and rows on seams), switched in CSS
 * since this renders on the server, so the loaded inbox lands without a jump.
 */
export function MessagesSkeleton() {
  return (
    <main className="ch-ms" aria-busy="true" aria-label="Loading messages" data-ch-code="CH-7401">
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
      <div className="ch-msp-skel" aria-hidden="true">
        <div className="ch-msp-skel__tools">
          <Skeleton width="100%" height={44} radius={14} />
          <span className="ch-msp-skel__chips">
            <Skeleton width={46} height={34} radius={17} />
            <Skeleton width={92} height={34} radius={17} />
            <Skeleton width={72} height={34} radius={17} />
          </span>
        </div>
        <div className="ch-msp-skel__sec">
          <span className="ch-msp-skel__h">
            <Skeleton width={150} height={18} radius={6} />
          </span>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="ch-msp-skel__row">
              <Skeleton width={44} height={44} radius={22} />
              <span>
                <Skeleton width="58%" height={14} />
                <Skeleton width="86%" height={12} />
              </span>
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
