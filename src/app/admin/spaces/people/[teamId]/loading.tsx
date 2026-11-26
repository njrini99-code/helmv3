import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceRoot } from '../../_ui/ui';
import '../people.css';

/** B18 loading (BR-1890): back link, hero with rings, chart and facts, then the people table, in their own shape. */
export default function Loading() {
  return (
    <SpaceRoot br={BR.team.loading}>
      <span className="bs-visually-hidden" role="status">
        Reading this team&rsquo;s people
      </span>
      <span className="bp-skel" style={{ width: 120, height: 40, borderRadius: 12 }} aria-hidden="true" />
      <section className="bp-hero" aria-hidden="true">
        <div style={{ display: 'grid', gap: 14 }}>
          <span className="bp-skel" style={{ width: 280, height: 12 }} />
          <span className="bp-skel" style={{ width: '75%', height: 56 }} />
          <span className="bp-skel" style={{ width: '60%', height: 56 }} />
          <span style={{ display: 'flex', gap: 8 }}>
            <span className="bp-skel" style={{ width: 260, height: 30, borderRadius: 999 }} />
            <span className="bp-skel" style={{ width: 260, height: 30, borderRadius: 999 }} />
          </span>
          <span className="bp-skel" style={{ width: '85%', height: 18 }} />
        </div>
        <span className="bp-skel" style={{ width: 168, height: 168, borderRadius: '50%' }} />
      </section>
      <div className="bp-two" aria-hidden="true">
        <div className="bs-panel" style={{ height: 300 }} />
        <div className="bs-panel" style={{ height: 300 }} />
      </div>
      <div className="bs-panel" aria-hidden="true">
        <div style={{ padding: '16px 22px' }}>
          <span className="bp-skel" style={{ width: 300, height: 48, borderRadius: 14 }} />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 22px', borderTop: '1px solid var(--bs-line)' }}>
            <span className="bp-skel" style={{ width: 36, height: 36, borderRadius: '50%' }} />
            <span className="bp-skel" style={{ flex: 1, height: 18 }} />
          </div>
        ))}
      </div>
    </SpaceRoot>
  );
}
