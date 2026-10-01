'use client';

import { Copy, Link2, RefreshCw, Share2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Slider } from '../../ui/Slider';
import { EmptyState } from '../../ui/States';
import {
  HANDICAP_OPTIONS,
  hoursLabel,
  minutesLabel,
  REMINDER_RANGES,
  remindersProblem,
  teamProblem,
  TIMEZONE_OPTIONS,
  type ChReminders,
  type ChScoring,
  type ChSettingsData,
  type ChSettingsWrites,
  type ChTeamInfo,
} from './model';
import { SAVE_COPY, useInvite } from './hooks';
import { Card, Field, ReadFailed, Row, SaveBar, SettingSwitch, useDraft, useReportDirty, useSaveAction } from './parts';

export function TeamSection({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  if (!data.teamId) {
    return (
      <div className="ch-surface ch-set-failed">
        <EmptyState code="CH-8301" title="You aren't on a team yet." body="Team settings appear once your program is set up and you're on its staff." />
      </div>
    );
  }
  return (
    <>
      {data.team?.error ? <ReadFailed what="Team details" code="CH-8205" onRetry={writes.refresh} /> : data.team && <TeamCard team={data.team.value} writes={writes} />}
      {data.joinCode?.error ? <ReadFailed what="Your invite code" code="CH-8206" onRetry={writes.refresh} /> : data.joinCode && <InviteCard code={data.joinCode.value} writes={writes} />}
      {data.scoring?.error ? <ReadFailed what="Scoring settings" code="CH-8207" onRetry={writes.refresh} /> : data.scoring && <ScoringCard scoring={data.scoring.value} writes={writes} />}
      {data.reminders?.error ? <ReadFailed what="Event reminders" code="CH-8208" onRetry={writes.refresh} /> : data.reminders && <RemindersCard reminders={data.reminders.value} writes={writes} />}
    </>
  );
}

function TeamCard({ team, writes }: { team: ChTeamInfo; writes: ChSettingsWrites }) {
  const f = useDraft(team);
  useReportDirty('team', f.dirty);
  const save = useSaveAction('settings.saveTeam', writes.saveTeam, SAVE_COPY.team, (_r, saved) => {
    f.commit(saved);
    writes.refresh();
  });
  const org = f.draft.org;
  const setOrg = (k: keyof NonNullable<ChTeamInfo['org']>, v: string) => f.setDraft((d) => (d.org ? { ...d, org: { ...d.org, [k]: v } } : d));
  const invalid = teamProblem(f.draft);
  return (
    <Card
      id="set-team"
      title="Team details"
      description="Shown to your players, and on invites and exports."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          invalid={invalid}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={() => void save.run(f.draft)}
        />
      }
    >
      <div className="ch-set-grid">
        <Field id="set-team-name" label="Team name" value={f.draft.name} onChange={(e) => f.setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Field id="set-team-season" label="Season" placeholder="2026–27" value={f.draft.season} onChange={(e) => f.setDraft((d) => ({ ...d, season: e.target.value }))} />
      </div>
      {org && (
        <>
          <div className="ch-set-sub">School</div>
          <div className="ch-set-grid">
            <Field id="set-org-name" label="Name" span={2} value={org.name} onChange={(e) => setOrg('name', e.target.value)} />
            <Field id="set-org-city" label="City" value={org.city} onChange={(e) => setOrg('city', e.target.value)} />
            <Field id="set-org-state" label="State" maxLength={2} placeholder="NC" value={org.state} onChange={(e) => setOrg('state', e.target.value.toUpperCase())} />
            <Field id="set-org-div" label="Division" placeholder="NCAA D1" value={org.division} onChange={(e) => setOrg('division', e.target.value)} />
            <Field id="set-org-conf" label="Conference" placeholder="ACC" value={org.conference} onChange={(e) => setOrg('conference', e.target.value)} />
          </div>
        </>
      )}
    </Card>
  );
}

function InviteCard({ code: initial, writes }: { code: string; writes: ChSettingsWrites }) {
  const { code, canShare, regen, copy, share } = useInvite(initial, writes);
  const [confirm, setConfirm] = useState(false);
  return (
    <Card id="set-invite" title="Invite players" description="Players join with this code, then you approve them from Roster.">
      <Row label="Invite code" help="Share it, or send the join link.">
        <b className="ch-set-code ch-num" aria-live="polite">
          {code}
        </b>
      </Row>
      <div className="ch-set-acts">
        <Button size="sm" leftIcon={Copy} onClick={() => void copy('code')}>
          Copy code
        </Button>
        <Button size="sm" leftIcon={Link2} onClick={() => void copy('link')}>
          Copy link
        </Button>
        {canShare && (
          <Button size="sm" leftIcon={Share2} onClick={() => void share()}>
            Share
          </Button>
        )}
      </div>
      <Row label="New code" help="Stops the current code from working right away. Anyone mid-join will need the new one.">
        <Button size="sm" variant="secondary" leftIcon={RefreshCw} disabled={regen.pending} onClick={() => setConfirm(true)}>
          {regen.pending ? 'Making…' : 'Make a new code'}
        </Button>
      </Row>
      <Modal
        open={confirm}
        code="CH-8503"
        onClose={() => setConfirm(false)}
        icon={RefreshCw}
        title="Replace your invite code?"
        description={`${code} stops working as soon as the new code is made. Share the new one with anyone who hasn't joined yet.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              Keep this code
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirm(false);
                void regen.run();
              }}
            >
              Make a new code
            </Button>
          </>
        }
      />
    </Card>
  );
}

export const TEES = [
  { value: 'black', label: 'Black' },
  { value: 'blue', label: 'Blue' },
  { value: 'white', label: 'White' },
  { value: 'gold', label: 'Gold' },
] as const;

function ScoringCard({ scoring, writes }: { scoring: ChScoring; writes: ChSettingsWrites }) {
  const f = useDraft(scoring);
  useReportDirty('scoring', f.dirty);
  const save = useSaveAction('settings.saveScoring', writes.saveScoring, SAVE_COPY.scoring, (_r, saved) => f.commit(saved));
  return (
    <Card
      id="set-scoring"
      title="Scoring and format"
      description="Defaults for new rounds and events. The timezone sets when every event and reminder happens."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={() => void save.run(f.draft)}
        />
      }
    >
      <Row label="Scoring format">
        <Segmented
          label="Scoring format"
          size="sm"
          value={f.draft.scoringFormat}
          options={[
            { value: 'stroke_play', label: 'Stroke play' },
            { value: 'match_play', label: 'Match play' },
          ]}
          onChange={(v) => f.setDraft((d) => ({ ...d, scoringFormat: v }))}
        />
      </Row>
      <Row label="Default tees">
        <Segmented label="Default tees" size="sm" value={f.draft.defaultTees} options={TEES} onChange={(v) => f.setDraft((d) => ({ ...d, defaultTees: v }))} />
      </Row>
      <Row label="Handicap system" htmlFor="set-hcp">
        <Select id="set-hcp" value={f.draft.handicapSystem} options={HANDICAP_OPTIONS} onChange={(v) => f.setDraft((d) => ({ ...d, handicapSystem: v }))} />
      </Row>
      <Row label="Team timezone" htmlFor="set-tz">
        <Select id="set-tz" value={f.draft.timezone} options={TIMEZONE_OPTIONS} onChange={(v) => f.setDraft((d) => ({ ...d, timezone: v }))} />
      </Row>
    </Card>
  );
}

function RemindersCard({ reminders, writes }: { reminders: ChReminders; writes: ChSettingsWrites }) {
  const f = useDraft(reminders);
  useReportDirty('reminders', f.dirty);
  const save = useSaveAction('settings.saveReminders', writes.saveReminders, SAVE_COPY.reminders, (_r, saved) => f.commit(saved));
  const invalid = remindersProblem(f.draft);
  return (
    <Card
      id="set-reminders"
      title="Event reminders"
      description="Players who haven't replied get a nudge before each event."
      foot={
        <SaveBar
          dirty={f.dirty}
          pending={save.pending}
          invalid={invalid}
          savedAt={f.savedAt}
          onReset={f.reset}
          onSave={() => void save.run(f.draft)}
        />
      }
    >
      <Row label="Send reminders">
        <SettingSwitch label="Send reminders" hideLabel checked={f.draft.enabled} onChange={(v) => f.setDraft((d) => ({ ...d, enabled: v }))} />
      </Row>
      {f.draft.enabled && (
        <div className="ch-set-sliders">
          <Slider
            label="First reminder"
            value={f.draft.earlyHours}
            {...REMINDER_RANGES.earlyHours}
            format={hoursLabel}
            onChange={(v) => f.setDraft((d) => ({ ...d, earlyHours: v }))}
          />
          <Slider
            label="Final reminder"
            value={f.draft.lateMinutes}
            {...REMINDER_RANGES.lateMinutes}
            format={minutesLabel}
            onChange={(v) => f.setDraft((d) => ({ ...d, lateMinutes: v }))}
          />
        </div>
      )}
    </Card>
  );
}
