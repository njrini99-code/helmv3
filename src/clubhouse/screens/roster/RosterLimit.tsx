'use client';

import { CircleSlash, UserCheck, Users } from 'lucide-react';
import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { saveRosterLimit, setRosterExemption } from '@/app/golf/actions/roster-limit';
import {
  countRoster,
  EXEMPT_REASON_LABEL,
  MAX_ROSTER_LIMIT,
  NCAA_D1_GOLF_ROSTER_LIMIT,
  ROSTER_EXEMPT_REASONS,
  ROSTER_LIMIT_SOURCE,
  rosterLimitLine,
  rosterOverText,
  type RosterCount,
  type RosterExemptReason,
  type RosterLimit,
} from '@/lib/golf/roster-limit';
import type { ChRoster, ChRosterLimit, ChRosterPlayer } from '../../data/roster';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import type { MenuItem } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { useAction } from '../../lib/use-action';

/**
 * F-05: the roster limit on the coach's Roster. NCAA Division I Bylaw 17.2 caps golf at 9 on the roster; a designated
 * student-athlete or a medical exemption doesn't count. The header states the count ("8 of 9 count toward the roster
 * limit"), warns when the roster is over (CH-3981), and opens the limit's sheet; a player's row menu marks them as not
 * counting (CH-3082) or counting again. Until the held migration is applied the division default is stated and nothing
 * can be changed (the sheet says so). The count reads active players only: an inactive player is off the roster.
 */

export interface RosterLimitControl {
  /** Null when the loader didn't send a limit (fixtures): nothing is drawn. */
  state: ChRosterLimit | null;
  count: RosterCount | null;
  /** The row menu's items for a player, empty when there is nothing to mark. */
  menuItems: (p: ChRosterPlayer) => MenuItem[];
  openLimit: () => void;
  dialogs: React.ReactNode;
}

const LIMIT_OPTIONS = Array.from({ length: MAX_ROSTER_LIMIT }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));
const REASON_OPTIONS = ROSTER_EXEMPT_REASONS.map((r) => ({ value: r, label: EXEMPT_REASON_LABEL[r] }));

export function useRosterLimit(data: ChRoster, players: ChRosterPlayer[], setPlayers: Dispatch<SetStateAction<ChRosterPlayer[]>>): RosterLimitControl {
  const [state, setState] = useState<ChRosterLimit | null>(data.rosterLimit ?? null);
  const [limitOpen, setLimitOpen] = useState(false);
  const [marking, setMarking] = useState<ChRosterPlayer | null>(null);
  const [draft, setDraft] = useState<RosterLimit>(state?.limit ?? { enabled: true, max: NCAA_D1_GOLF_ROSTER_LIMIT });
  const [reason, setReason] = useState<RosterExemptReason>('designated');
  const teamId = data.teamId ?? '';

  const count = useMemo(() => {
    if (!state) return null;
    const active = players.filter((p) => p.status === 'active');
    const exempt = Object.fromEntries(active.filter((p) => p.rosterExempt).map((p) => [p.id, { reason: p.rosterExempt as RosterExemptReason, note: null }]));
    return countRoster(
      active.map((p) => p.id),
      exempt,
      state.limit,
    );
  }, [players, state]);

  const save = useAction(
    'roster.saveLimit',
    async (next: RosterLimit) => {
      const res = await saveRosterLimit({ teamId, enabled: next.enabled, max: next.max });
      if (res.success) {
        setState((s) => (s ? { ...s, limit: next, from: 'saved' } : s));
        setLimitOpen(false);
      }
      return res;
    },
    (next: RosterLimit) => ({
      done: next.enabled ? `Roster limit set to ${next.max}` : 'Roster limit turned off',
      failed: 'Couldn’t save the roster limit',
      code: 'CH-3081',
    }),
  );

  const mark = useAction(
    'roster.setExemption',
    async (p: ChRosterPlayer, to: RosterExemptReason | null) => {
      const before = p.rosterExempt ?? null;
      setPlayers((ps) => ps.map((x) => (x.id === p.id ? { ...x, rosterExempt: to } : x)));
      const res = await setRosterExemption({ teamId, playerId: p.id, reason: to });
      if (!res.success) setPlayers((ps) => ps.map((x) => (x.id === p.id ? { ...x, rosterExempt: before } : x)));
      else setMarking(null);
      return res;
    },
    (p: ChRosterPlayer, to: RosterExemptReason | null) => ({
      done: to ? `${p.name} doesn’t count toward the roster limit` : `${p.name} counts toward the roster limit`,
      failed: to ? `Couldn’t mark ${p.name} as not counting` : `Couldn’t count ${p.name} toward the limit`,
      code: 'CH-3082',
    }),
  );

  const canMark = !!state && state.limit.enabled && !state.missing && !state.error && !!teamId;
  const menuItems = (p: ChRosterPlayer): MenuItem[] => {
    if (!canMark || p.status !== 'active') return [];
    return p.rosterExempt
      ? [{ label: 'Count toward the roster limit', icon: UserCheck, onSelect: () => void mark.run(p, null) }]
      : [
          {
            label: 'Doesn’t count toward the limit…',
            icon: CircleSlash,
            onSelect: () => {
              setReason('designated');
              setMarking(p);
            },
          },
        ];
  };

  const openLimit = () => {
    setDraft(state?.limit.enabled ? state.limit : { enabled: true, max: state?.limit.max ?? NCAA_D1_GOLF_ROSTER_LIMIT });
    setLimitOpen(true);
  };

  const locked = !state || state.missing || !teamId;
  const dialogs = state ? (
    <>
      <Modal
        open={limitOpen}
        onClose={() => setLimitOpen(false)}
        width={460}
        icon={Users}
        title="Roster limit"
        description={`Division I golf allows ${NCAA_D1_GOLF_ROSTER_LIMIT} on the roster (${ROSTER_LIMIT_SOURCE}). Your conference may set fewer.`}
        footer={
          locked ? (
            <Button data-ctl="CTL-P003-020" variant="ghost" onClick={() => setLimitOpen(false)}>
              Close
            </Button>
          ) : (
            <>
              <Button data-ctl="CTL-P003-021" variant="ghost" onClick={() => setLimitOpen(false)}>
                Cancel
              </Button>
              <Button data-ctl="CTL-P003-022" variant="primary" busy={save.pending} onClick={() => void save.run(draft)}>
                Save
              </Button>
            </>
          )
        }
      >
        <div className="ch-rs-limitf">
          <div className="ch-field">
            <span className="ch-field__label" aria-hidden="true">
              Count the roster against a limit
            </span>
            <Segmented
              label="Count the roster against a limit"
              value={draft.enabled ? 'on' : 'off'}
              options={[
                { value: 'on', label: 'On' },
                { value: 'off', label: 'Off' },
              ]}
              onChange={(v) => setDraft((d) => ({ ...d, enabled: v === 'on' }))}
              block
            />
          </div>
          {draft.enabled && (
            <div className="ch-field">
              <label htmlFor="rs-limit-max" className="ch-field__label">
                Players who count
              </label>
              <Select
                id="rs-limit-max"
                value={String(draft.max)}
                options={LIMIT_OPTIONS}
                onChange={(v) => setDraft((d) => ({ ...d, max: Number(v) }))}
                disabled={locked}
                describedBy="rs-limit-help"
              />
              <p className="ch-field__help" id="rs-limit-help">
                Designated student-athletes and medical exemptions don’t count. Mark them from a player’s menu.
              </p>
            </div>
          )}
          {locked && (
            <p className="ch-field__help" data-ch-code="CH-3982">
              {state.limit.enabled ? `The limit is ${state.limit.max}, from your division.` : 'No limit is set.'} Changing it arrives with the next update.
            </p>
          )}
        </div>
      </Modal>
      <Modal
        open={!!marking}
        onClose={() => setMarking(null)}
        width={460}
        icon={CircleSlash}
        title={marking ? `${marking.firstName} doesn’t count` : 'Doesn’t count'}
        description="A player who doesn’t count stays on the roster and in every lineup. Only the roster limit leaves them out."
        footer={
          <>
            <Button data-ctl="CTL-P003-023" variant="ghost" onClick={() => setMarking(null)}>
              Cancel
            </Button>
            <Button data-ctl="CTL-P003-024" variant="primary" busy={mark.pending} onClick={() => marking && void mark.run(marking, reason)}>
              Save
            </Button>
          </>
        }
      >
        <div className="ch-field">
          <label htmlFor="rs-exempt-why" className="ch-field__label">
            Why
          </label>
          <Select id="rs-exempt-why" value={reason} options={REASON_OPTIONS} onChange={setReason} describedBy="rs-exempt-help" />
          <p className="ch-field__help" id="rs-exempt-help">
            {reason === 'designated'
              ? 'A designated student-athlete: one whose roster place the House settlement protected.'
              : 'A medically documented injury or illness that means they can never compete again.'}
          </p>
        </div>
      </Modal>
    </>
  ) : null;

  return { state, count, menuItems, openLimit, dialogs };
}

/** The header's line: the count, a warning when over, and the limit's sheet. Nothing with no limit sent (fixtures). */
export function RosterLimitLine({ ctl }: { ctl: RosterLimitControl }) {
  const { state, count } = ctl;
  if (!state || !count) return null;
  const line = rosterLimitLine(count);
  return (
    <>
      <p className="ch-rs-limit" data-ch-roster-limit={count.over > 0 ? 'over' : count.enabled ? 'on' : 'off'}>
        {line ? <span className="ch-num">{line}</span> : null}
        {count.over > 0 && (
          <Badge tone="warning" dot>
            {count.over} over
          </Badge>
        )}
        <Button data-ctl="CTL-P003-025" variant="ghost" size="sm" onClick={ctl.openLimit}>
          {count.enabled ? 'Roster limit' : 'Set a roster limit'}
        </Button>
      </p>
      {count.over > 0 && (
        <p className="ch-rs-limit__over" role="status" data-ch-code="CH-3981">
          {rosterOverText(count)}
        </p>
      )}
      {state.error && (
        <p className="ch-rs-limit__over" data-ch-code="CH-3283">
          Couldn’t read who doesn’t count toward the limit, so every active player is counted.
        </p>
      )}
    </>
  );
}
