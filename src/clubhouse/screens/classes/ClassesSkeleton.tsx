import { Skeleton } from '../../ui/States';
import { LargeTitle } from '../../ui/LargeTitle';
import '../../styles/classes.css';
import { CrhSkelCard } from '../../ui/CrhSkelCard';

/**
 * Route loading for Classes (06 §4.8), in the loaded page's shape so nothing moves when the classes land. Two shapes,
 * and classes.css shows the one for the width, so the server needs no width to draw it. Both keep what is already
 * known: the title is real, the term card is its green plate with ivory bars, and Today and Your classes are named.
 */
export function ClassesSkeleton() {
  return (
    <main className="ch-cl" aria-busy="true" aria-label="Loading your classes" data-ch-code="CH-12401">
      {/* Desktop: the head and its two actions, the term card, three binders to a row beside the overlaps. */}
      <div className="ch-cl-sk-dcrh" aria-hidden="true">
        <header className="ch-cl-sk-dcrh__h">
          <div className="ch-cl-sk-dcrh__stack">
            <Skeleton width={190} height={13} />
            <p className="ch-cl-sk-dcrh__title">Classes</p>
          </div>
          <div className="ch-cl-sk-dcrh__acts">
            <Skeleton width={150} height={36} radius={10} />
            <Skeleton width={120} height={36} radius={10} />
          </div>
        </header>
        <span className="ch-cl-sk-crh__term is-desk">
          {['24%', '46%', '100%', '32%'].map((w, i) => (
            <i key={i} style={{ width: w, height: [16, 28, 12, 14][i] }} />
          ))}
        </span>
        <div className="ch-cl-sk-dcrh__grid">
          <section>
            <b className="ch-cl-sk-dcrh__label">Your classes</b>
            <div className="ch-cl-sk-dcrh__deck">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} width="100%" height={236} radius={16} shape="solid" />
              ))}
            </div>
          </section>
          <div className="ch-cl-sk-dcrh__stack">
            <CrhSkelCard title="Overlaps" rows={2} />
            <Skeleton width="100%" height={120} radius={16} shape="solid" />
          </div>
        </div>
      </div>
      {/* Phone: the large title, the term line, the term card, then Today and Your classes as named cards. */}
      <div className="ch-cl-sk-crh" aria-hidden="true">
        <LargeTitle as="p" hidden className="ch-cl-title">Classes</LargeTitle>
        <Skeleton width={190} height={15} />
        <span className="ch-cl-sk-crh__term">
          {['38%', '62%', '100%', '54%'].map((w, i) => (
            <i key={i} style={{ width: w, height: [14, 26, 10, 12][i] }} />
          ))}
        </span>
        {['Today', 'Your classes'].map((t) => (
          <CrhSkelCard key={t} title={t} />
        ))}
      </div>
    </main>
  );
}
