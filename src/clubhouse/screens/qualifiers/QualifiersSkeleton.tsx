import { Skeleton } from '../../ui/States';
import '../../styles/qualifiers.css';

/** Route loading for the Qualifiers list: head, tools, the hero and a row of cards in their final slots. */
export function QualifiersSkeleton() {
  return (
    <main className="ch-qf ch-qf--list" aria-busy="true" aria-label="Loading qualifiers" data-ch-code="CH-09401">
      <header className="ch-qf-head">
        <div>
          <Skeleton width={200} height={14} />
          <Skeleton width={300} height={34} radius={10} />
          <Skeleton width={380} height={16} />
        </div>
        <Skeleton width={160} height={38} radius={10} />
      </header>
      <div className="ch-qf-tools">
        <Skeleton width={260} height={32} radius={16} />
        <Skeleton width={360} height={36} radius={10} />
      </div>
      <div className="ch-qf-hero" style={{ cursor: 'default' }}>
        <div className="ch-qf-hero__main">
          <Skeleton width={56} height={22} radius={5} />
          <Skeleton width={280} height={30} radius={8} />
          <Skeleton width="80%" height={14} />
          <Skeleton width={240} height={14} />
        </div>
        <Skeleton width="100%" height={180} radius={12} />
      </div>
      <div className="ch-qf-grid">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="ch-qf-card" style={{ cursor: 'default' }}>
            <Skeleton width={200} height={18} />
            <Skeleton width="90%" height={13} />
            <Skeleton width={220} height={13} />
          </div>
        ))}
      </div>
    </main>
  );
}

/** Route loading for one qualifier: head, facts, the leaderboard and the side cards. */
export function QualifierDetailSkeleton() {
  return (
    <main className="ch-qf" aria-busy="true" aria-label="Loading the qualifier" data-ch-code="CH-09402">
      <Skeleton width={110} height={30} radius={8} />
      <header className="ch-qf-head">
        <div>
          <Skeleton width={140} height={22} radius={5} />
          <Skeleton width={320} height={34} radius={10} />
          <Skeleton width={420} height={16} />
        </div>
      </header>
      <div className="ch-qf-facts">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <Skeleton width={70} height={12} />
            <Skeleton width={90} height={22} radius={6} />
            <Skeleton width={60} height={12} />
          </div>
        ))}
      </div>
      <div className="ch-qf-body">
        <div className="ch-qf-panel ch-qf-skel" style={{ padding: 20 }}>
          <Skeleton width={120} height={16} />
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} width="100%" height={44} radius={10} />
          ))}
        </div>
        <div className="ch-qf-col">
          <div className="ch-qf-side ch-qf-skel" style={{ padding: 20 }}>
            <Skeleton width={100} height={16} />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} width="100%" height={30} radius={8} />
            ))}
          </div>
          <div className="ch-qf-side ch-qf-skel" style={{ padding: 20 }}>
            <Skeleton width={130} height={16} />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} width="100%" height={30} radius={8} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Route loading for Manage selections: head, the three steps, the note, the places on score and the picks, in their final slots. */
export function QualifierSelectionSkeleton() {
  return (
    <main className="ch-qf ch-qfs" aria-busy="true" aria-label="Loading Manage selections" data-ch-code="CH-09409">
      <div className="ch-qf-back">
        <Skeleton width={110} height={30} radius={8} />
      </div>
      <header className="ch-qf-head">
        <div>
          <Skeleton width={140} height={14} />
          <Skeleton width={320} height={34} radius={10} />
          <Skeleton width={380} height={16} />
        </div>
        <div className="ch-qf-head__act">
          <Skeleton width={150} height={38} radius={10} />
        </div>
      </header>
      <ol className="ch-qfs-steps" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Skeleton width={22} height={22} radius={11} />
            <Skeleton width={96} height={13} />
          </li>
        ))}
      </ol>
      <div className="ch-qf-note">
        <Skeleton width={16} height={16} radius={8} />
        <Skeleton width="70%" height={14} />
      </div>
      <div className="ch-qf-body">
        <div className="ch-qf-col">
          <div className="ch-qf-panel ch-qf-skel" style={{ padding: 20 }}>
            <Skeleton width={120} height={16} />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} width="100%" height={42} radius={10} />
            ))}
          </div>
          <div className="ch-qf-panel ch-qf-skel" style={{ padding: 20 }}>
            <Skeleton width={140} height={16} />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} width="100%" height={42} radius={10} />
            ))}
          </div>
        </div>
        <div className="ch-qf-col">
          <div className="ch-qf-side ch-qf-skel" style={{ padding: 20 }}>
            <Skeleton width={110} height={16} />
            <Skeleton width="100%" height={64} radius={10} />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Route loading for the create and edit form. */
export function QualifierFormSkeleton() {
  return (
    <main className="ch-qf ch-qf--form" aria-busy="true" aria-label="Loading the qualifier form" data-ch-code="CH-09403">
      <Skeleton width={110} height={30} radius={8} />
      <header className="ch-qf-head">
        <div>
          <Skeleton width={120} height={14} />
          <Skeleton width={300} height={34} radius={10} />
          <Skeleton width={420} height={16} />
        </div>
      </header>
      <div className="ch-qf-form">
        <div className="ch-qf-col">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="ch-qf-fs ch-qf-skel" style={{ paddingTop: 20 }}>
              <Skeleton width={120} height={16} />
              <Skeleton width="100%" height={38} radius={10} />
              <Skeleton width="100%" height={38} radius={10} />
            </div>
          ))}
        </div>
        <div className="ch-qf-fs ch-qf-skel" style={{ paddingTop: 20 }}>
          <Skeleton width={120} height={16} />
          <Skeleton width="100%" height={38} radius={10} />
          <Skeleton width="100%" height={44} radius={12} />
        </div>
      </div>
    </main>
  );
}
