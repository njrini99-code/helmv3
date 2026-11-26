import { BR } from '@/lib/admin/clubhouse/br-codes';
import { SpaceRoot } from '../_ui/ui';
import { Skel } from '../_landing/parts';

/** Desk space loading (BR-2490): header, tiles and panels at their real sizes. */
export default function DeskSpaceLoading() {
  return (
    <SpaceRoot br={BR.desk.loading}>
      <div role="status" aria-label="Loading Desk" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Skel w={220} h={12} />
        <Skel w="min(640px, 90%)" h={56} />
        <Skel w="min(520px, 70%)" h={56} />
        <Skel w="min(760px, 100%)" h={20} />
      </div>
      <div className="bs-tiles">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bs-panel bs-tile">
            <Skel w={90} h={12} />
            <Skel w={110} h={32} />
            <Skel w="80%" h={12} />
          </div>
        ))}
      </div>
      <div className="bs-split">
        <div className="bs-panel bs-panel-pad bs-split-main">
          <Skel h={240} />
        </div>
        <div className="bs-panel bs-panel-pad bs-split-side">
          <Skel h={240} />
        </div>
      </div>
    </SpaceRoot>
  );
}
