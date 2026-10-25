'use client';

import { Eye } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SHARE_COPY, SHARE_LABEL } from '../../../live/copy';
import type { LiveRoundType, LiveShare } from '../../../live/model';
import { shareControl, shareOptions } from '../../../live/share';
import type { LiveSharePorts } from '../../../live/share-ports';
import { Button } from '../../../ui/Button';
import { Modal } from '../../../ui/Modal';
import { Segmented } from '../../../ui/Segmented';
import '../../../styles/live.css';

/**
 * The in-round "Sharing" sheet (4.6): the same three choices as setup, applied at once. The level moves optimistically,
 * and goes back to what it was, with the reason, if the database refuses (CH-16664 to CH-16666). A qualifier is always
 * shown to coaches, so its choice is fixed and the caption says why; a tournament has no sheet. `onChanged` tells the
 * Exit sheet's row what the level is now.
 */
export function LiveShareSheet({
  open,
  onClose,
  roundId,
  type,
  level,
  ports,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  roundId: string;
  type: LiveRoundType;
  level: LiveShare;
  ports: LiveSharePorts;
  onChanged: (level: LiveShare) => void;
}) {
  const control = shareControl(type);
  const [shown, setShown] = useState(level);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => setShown(level), [level, open]);

  const change = async (next: LiveShare) => {
    const before = shown;
    setError(null);
    setShown(next);
    setBusy(true);
    const result = await ports.setShare(roundId, next, false);
    if (!alive.current) return;
    setBusy(false);
    if (result.success) {
      setShown(result.data.share);
      onChanged(result.data.share);
      return;
    }
    setShown(before);
    setError(result.error);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={SHARE_COPY.label}
      icon={Eye}
      width={440}
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <div className="ch-lv-sheetshare" data-ch-code="CH-16660">
        <div data-ch-code="CH-16661">
          <Segmented<LiveShare> block label={SHARE_COPY.label} value={shown} options={shareOptions(type)} onChange={(v) => void change(v)} />
        </div>
        {control === 'floor' && (
          <p className="ch-lv-note" data-ch-code="CH-16662">
            {SHARE_COPY.qualifierCaption}
          </p>
        )}
        <p className="ch-lv-note" data-ch-code="CH-16663">
          {SHARE_COPY.helper}
        </p>
        {control === 'choose' && (
          <p className="ch-lv-note" data-ch-code="CH-16684">
            {SHARE_COPY.notLiveNote}
          </p>
        )}
        {busy && <span className="ch-sr-only" role="status">Saving</span>}
        {error && (
          <p className="ch-lv-note" data-tone="warn" role="alert" data-ch-code="CH-16664">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

/**
 * The Exit sheet's Sharing row and this sheet, for one round. `row` is what the Exit sheet draws (absent when sharing is
 * not there yet, the round has no id yet, or it is a tournament); `sheet` is the sheet itself.
 */
export function useRoundSharing(input: { roundId: string | null; type: LiveRoundType; ports: LiveSharePorts } | undefined): {
  row: { label: string; onChange: () => void } | undefined;
  sheet: ReactNode;
  openSheet: () => void;
} {
  const roundId = input?.roundId ?? null;
  const type = input?.type ?? 'practice';
  const ports = input?.ports;
  const [level, setLevel] = useState<LiveShare | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!roundId || !ports) {
      setLevel(null);
      return;
    }
    let alive = true;
    void ports.loadRoundShare(roundId, type).then((l) => alive && setLevel(l));
    return () => {
      alive = false;
    };
  }, [roundId, type, ports]);

  if (!input || !roundId || !ports || level === null || shareControl(type) === 'none') return { row: undefined, sheet: null, openSheet: () => {} };
  const openSheet = () => setOpen(true);
  return {
    row: { label: SHARE_LABEL[level], onChange: openSheet },
    openSheet,
    sheet: <LiveShareSheet open={open} onClose={() => setOpen(false)} roundId={roundId} type={type} level={level} ports={ports} onChanged={setLevel} />,
  };
}
