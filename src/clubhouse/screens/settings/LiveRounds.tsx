'use client';

import { useEffect, useState } from 'react';
import { SHARE_COPY, SHARE_LABEL } from '../../live/copy';
import type { LiveShare } from '../../live/model';
import { SHARE_LEVELS } from '../../live/share';
import { browserSharePorts, type LiveSharePorts } from '../../live/share-ports';
import { useAction } from '../../lib/use-action';
import { Select } from '../../ui/Select';
import { Card, Row } from './parts';
import { Group, InfoRow, PickerRow } from './phone/ui';
import '../../styles/live.css';

/**
 * Settings, "Live rounds" (player, 4.6): two rows. Practice rounds is a menu of the three levels (the default a new
 * practice round starts at; round setup can still change it for one round). Qualifier rounds has one allowed level,
 * coaches, so it is read-only with the reason. Nothing is drawn until the live table exists (`loadPrefs` answers
 * null), and the answer comes with the player's own default.
 */

const OPTIONS = SHARE_LEVELS.map((value) => ({ value, label: SHARE_LABEL[value] }));
const COPY = { done: '', failed: SHARE_COPY.error, code: 'CH-16664' } as const;

export function useLivePrefs(ports: LiveSharePorts = browserSharePorts) {
  const [practiceShare, setPracticeShare] = useState<LiveShare | null>(null);
  useEffect(() => {
    let alive = true;
    void ports.loadPrefs().then((p) => alive && setPracticeShare(p?.practiceShare ?? null));
    return () => {
      alive = false;
    };
  }, [ports]);
  const save = useAction('settings.livePrefs', (share: LiveShare) => ports.setPrefs(share), COPY);
  const set = async (share: LiveShare) => {
    const before = practiceShare;
    setPracticeShare(share);
    const result = await save.run(share);
    // The control goes back to the level it had when the database refused.
    if (!result.success) setPracticeShare(before);
  };
  return { practiceShare, pending: save.pending, set };
}

export function LiveRoundsCard({ ports }: { ports?: LiveSharePorts }) {
  const { practiceShare, pending, set } = useLivePrefs(ports);
  if (practiceShare === null) return null;
  return (
    <Card id="set-live" title="Live rounds" description="Who can follow a round while you play it. They see your score and the hole you’re on, not your location.">
      <Row label="Practice rounds" htmlFor="set-live-practice" code="CH-16661">
        <Select<LiveShare> id="set-live-practice" value={practiceShare} options={OPTIONS} disabled={pending} onChange={(v) => void set(v)} />
      </Row>
      <Row label="Qualifier rounds" help={SHARE_COPY.qualifierCaption} code="CH-16662">
        <span className="ch-set-value">{SHARE_LABEL.coaches}</span>
      </Row>
    </Card>
  );
}

export function LiveRoundsGroup({ ports }: { ports?: LiveSharePorts }) {
  const { practiceShare, pending, set } = useLivePrefs(ports);
  if (practiceShare === null) return null;
  return (
    <Group title="Live rounds" note={SHARE_COPY.helper}>
      <PickerRow<LiveShare> label="Practice rounds" value={practiceShare} options={OPTIONS} disabled={pending} onPick={(v) => void set(v)} />
      <InfoRow label="Qualifier rounds" value={SHARE_LABEL.coaches} help={SHARE_COPY.qualifierCaption} />
    </Group>
  );
}
