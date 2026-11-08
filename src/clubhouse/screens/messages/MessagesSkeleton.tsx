import { Skeleton } from '../../ui/States';
import '../../styles/messages.css';
import '../../styles/messages-thread.css';
import '../../styles/messages-inbox.css';
import { InboxSkeleton } from './inbox/InboxSkeleton';

/**
 * Route loading for Messages: the rail's head and rows, and an empty thread column, in place. On the phone it is the
 * inbox's own shape instead (the search well and New key, the filter well, the Recent card of five rows), switched in CSS
 * since this renders on the server, so the loaded inbox lands without a jump (MSG-112, MSG-126). No large title: the
 * phone inbox has none. It carries the screen's own attribute (MessagesScreen sets it on the loaded one) so the same
 * rules draw the same boxes.
 */
export function MessagesSkeleton() {
  return (
    <main className="ch-ms" aria-busy="true" aria-label="Loading messages" data-ch-code="CH-7401" data-ch-ms-v2="">
      <aside className="ch-ms-rail ch-inb ch-inb--rail">
        <div className="ch-ms-rail__head" aria-hidden="true">
          <div className="ch-ms-rail__title">
            <div className="ch-inb-sk__title" />
            <div className="ch-inb-sk__new" />
          </div>
          <div className="ch-inb-sk__ctx" />
          <div className="ch-inb-sk__search" />
          <div className="ch-inb-sk__seg" />
        </div>
        <div className="ch-ms-rail__body">
          <InboxSkeleton layout="rail" />
        </div>
      </aside>
      <section className="ch-ms-thread">
        <div className="ch-ms-th">
          <Skeleton width={220} height={38} radius={19} />
        </div>
      </section>
      <div className="ch-msp-skel ch-inb ch-inb--phone ch-inb-skelpage">
        <div className="ch-inb-skeltop" aria-hidden="true">
          <div className="ch-inb-sk__row">
            <div className="ch-inb-sk__search" />
            <div className="ch-inb-sk__new" />
          </div>
          <div className="ch-inb-sk__seg" />
        </div>
        <InboxSkeleton layout="card" />
      </div>
    </main>
  );
}
