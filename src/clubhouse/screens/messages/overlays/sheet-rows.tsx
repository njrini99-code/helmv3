'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChMsg } from '../model';
import { useSeenBy } from '../seen-by';
import { CheckCheck, ListChecks, BellRing, Lock, Share, Copy } from 'lucide-react';
import { pollCardActions } from '../polls';
import { Icon } from '../../../ui/Icon';

/** P-1 slice 6: "Seen by 9 of 11" in the long-press sheet, for a coach, between Reply and Copy. */
export function SeenSheetRow({ api, m, open, hold }: { api: ChMessagesApi; m: ChMsg; open: () => void; hold?: boolean }) {
  const seen = useSeenBy(api, m);
  if (!seen?.canOpen) return null;
  return <SheetRow hold={hold} icon={CheckCheck} label={seen.label === "Sent" ? "Not seen yet" : seen.label} onClick={open} />;
}

/** P-1: a player under (a) sees the count of their own message in the sheet's preview line, never the list. */
export function ActingSeenMeta({ api, m }: { api: ChMessagesApi; m: ChMsg }) {
  const seen = useSeenBy(api, m);
  if (!seen || seen.canOpen) return null;
  return <> · {seen.label}</>;
}

/** D26: a poll's own rows in the long-press sheet, from its card's live state: See votes, Remind, Close poll, Share result. */
export function PollSheetRows({ id, done, hold }: { id: string; done: () => void; hold?: boolean }) {
  const a = pollCardActions(id);
  if (!a) return null;
  const run = (f: () => void) => () => {
    done();
    f();
  };
  return (
    <>
      {a.seeVotes && <SheetRow hold={hold} icon={ListChecks} label="See votes" onClick={run(a.seeVotes)} />}
      {a.remind && <SheetRow hold={hold} icon={BellRing} label={`Remind ${a.remind.count}`} onClick={run(a.remind.run)} />}
      {a.close && <SheetRow hold={hold} icon={Lock} label="Close poll" onClick={run(a.close)} />}
      {a.share && <SheetRow hold={hold} icon={Share} label="Share result" onClick={run(a.share)} />}
    </>
  );
}

export function SheetRow({ icon, label, onClick, danger, disabled, hold }: { icon: typeof Copy; label: string; onClick: () => void; danger?: boolean; disabled?: boolean; /** The redesign's glass menu: the word, then the icon (S-MSG.hold). */ hold?: boolean }) {
  if (hold)
    return (
      <button type="button" className={danger ? "is-danger" : undefined} onClick={onClick} disabled={disabled}>
        <span>{label}</span>
        <Icon icon={icon} size={18} />
      </button>
    );
  return (
    <button type="button" className={"ch-msp-row is-btn" + (danger ? " is-danger" : "")} onClick={onClick} disabled={disabled}>
      <span className="ch-msp-row__ic">
        <Icon icon={icon} size={16} />
      </span>
      <span className="ch-msp-row__b">
        <b>{label}</b>
      </span>
    </button>
  );
}
