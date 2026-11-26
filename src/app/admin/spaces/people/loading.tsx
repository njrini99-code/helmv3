import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceRoot } from '../_ui/ui';
import './people.css';

/** B17 loading (BR-1790): the headline, state strip, three cards and the ranked list, in their own shape. */
export default function Loading() {
  return (
    <SpaceRoot br={BR.teams.loading}>
      <span className="bs-visually-hidden" role="status">
        Reading every team&rsquo;s activity
      </span>
      <section style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-end' }} aria-hidden="true">
        <div style={{ flex: '1 1 600px', display: 'grid', gap: 14 }}>
          <span className="bp-skel" style={{ width: 260, height: 12 }} />
          <span className="bp-skel" style={{ width: '70%', height: 56 }} />
          <span className="bp-skel" style={{ width: '55%', height: 56 }} />
          <span className="bp-skel" style={{ width: '80%', height: 18 }} />
        </div>
        <div className="bs-panel" style={{ width: 300, height: 140 }} />
      </section>
      <div className="bp-needs" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bs-panel bp-need" style={{ height: 150 }}>
            <span className="bp-skel" style={{ width: 120, height: 10 }} />
            <span className="bp-skel" style={{ width: '70%', height: 16 }} />
            <span className="bp-skel" style={{ width: 90, height: 34 }} />
          </div>
        ))}
      </div>
      <div className="bs-panel" aria-hidden="true">
        <div style={{ padding: '20px 22px 14px', display: 'flex', gap: 10 }}>
          <span className="bp-skel" style={{ width: 240, height: 40, borderRadius: 14 }} />
          <span className="bp-skel" style={{ width: 360, height: 40, borderRadius: 14 }} />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="bp-team" style={{ pointerEvents: 'none' }}>
            <span className="bp-rank">{i + 1}</span>
            <span className="bp-skel bp-c-name" style={{ height: 30 }} />
            <span className="bp-skel bp-c-active" style={{ height: 30 }} />
            <span className="bp-skel bp-c-seen" style={{ height: 30 }} />
            <span className="bp-skel bp-c-spark" style={{ height: 30 }} />
            <span className="bp-skel bp-c-rounds" style={{ height: 30 }} />
            <span className="bp-skel bp-c-errors" style={{ height: 30 }} />
            <span className="bp-skel bp-c-state" style={{ height: 24, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </SpaceRoot>
  );
}
