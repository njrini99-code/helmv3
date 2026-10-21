'use client';

import { CourseLocationCard } from './course-location';
import { Check, Copy, Link2, RefreshCw, Share2 } from 'lucide-react';
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
import { Card, Field, failedReads, ReadFailed, ReadsFailed, Row, SettingSwitch, useDraft, useReportDirty, useSaveAction, useWarnOnOpen } from './parts';
import { StaffCards } from './Staff';

/** Team's reads that failed, for its one section notice (shared with TeamPhone). */
export const teamReadsFailed = (data: ChSettingsData) =>
  failedReads([
    [data.joinCode?.error, 'your team code'],
    [data.team?.error, 'team details'],
    [data.scoring?.error, 'scoring settings'],
    [data.reminders?.error, 'event reminders'],
  ]);

export function TeamSection({ data, writes }: { data: ChSettingsData; writes: ChSettingsWrites }) {
  if (!data.teamId) {
    return (
      <div className="ch-surface ch-set-failed">
        <EmptyState code="CH-8301" title="You aren’t on a team yet" body="Team settings appear once your program is set up and you’re on its staff." />
      </div>
    );
  }
  const failed = teamReadsFailed(data);
  const covered = failed.length > 1;
  return (
    <>
      <ReadsFailed parts={failed} onRetry={writes.refresh} />
      {/* The team code first: it is what a coach comes here for most, and Team details ran it under the fold (wave-6 #20). */}
      {data.joinCode?.error ? <ReadFailed what="Your team code" code="CH-8206" onRetry={writes.refresh} title="Invite players" description="Players who sign up with your team code or open your invite link join right away. You can remove anyone from Roster." covered={covered} /> : data.joinCode && <InviteCard code={data.joinCode.value} writes={writes} />}
      {data.team?.error ? <ReadFailed what="Team details" code="CH-8205" onRetry={writes.refresh} title="Team details" description="Shown to your players, and on invites and exports." covered={covered} /> : data.team && <TeamCard team={data.team.value} writes={writes} />}
      <StaffCards coachId={data.coachId} writes={writes} />
      {data.scoring?.error ? <ReadFailed what="Scoring settings" code="CH-8207" onRetry={writes.refresh} title="Scoring and format" description="Defaults for new rounds and events. The timezone sets when every event and reminder happens." covered={covered} /> : data.scoring && <ScoringCard scoring={data.scoring.value} writes={writes} />}
      {data.reminders?.error ? <ReadFailed what="Event reminders" code="CH-8208" onRetry={writes.refresh} title="Event reminders" description="Players who haven’t replied get a nudge before each event." covered={covered} /> : data.reminders && <RemindersCard reminders={data.reminders.value} writes={writes} />}
      {/* The global light's place (P001-A1): drawn only once its columns exist (migration 20261008150000). */}
      <CourseLocationCard teamId={data.teamId} />
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
  // The field a problem names says it too, once there are changes, as the save bar does (wave-6 #22).
  const errorAt = (id: string) => (invalid && f.dirty && invalid.field === id ? invalid : null);
  return (
    <Card
      id="set-team"
      title="Team details"
      description="Shown to your players, and on invites and exports."
      save={{ dirty: f.dirty, pending: save.pending, invalid, savedAt: f.savedAt, onReset: f.reset, onSave: () => void save.run(f.draft) }}
    >
      <div className="ch-set-grid">
        <Field id="set-team-name" label="Team name" error={errorAt('set-team-name')} value={f.draft.name} onChange={(e) => f.setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Field id="set-team-season" label="Season" placeholder="2026–27" value={f.draft.season} onChange={(e) => f.setDraft((d) => ({ ...d, season: e.target.value }))} />
      </div>
      {org && (
        <>
          <div className="ch-set-sub">School</div>
          <div className="ch-set-grid">
            <Field id="set-org-name" label="Name" span={2} error={errorAt('set-org-name')} value={org.name} onChange={(e) => setOrg('name', e.target.value)} />
            <Field id="set-org-city" label="City" value={org.city} onChange={(e) => setOrg('city', e.target.value)} />
            <Field id="set-org-state" label="State" maxLength={2} placeholder="NC" error={errorAt('set-org-state')} value={org.state} onChange={(e) => setOrg('state', e.target.value.toUpperCase())} />
            <Field id="set-org-div" label="Division" placeholder="NCAA D1" value={org.division} onChange={(e) => setOrg('division', e.target.value)} />
            <Field id="set-org-conf" label="Conference" placeholder="ACC" value={org.conference} onChange={(e) => setOrg('conference', e.target.value)} />
          </div>
        </>
      )}
    </Card>
  );
}

function InviteCard({ code: initial, writes }: { code: string; writes: ChSettingsWrites }) {
  const { code, canShare, regen, copy, copied, share } = useInvite(initial, writes);
  const [confirm, setConfirm] = useState(false);
  useWarnOnOpen(confirm);
  return (
    <Card id="set-invite" title="Invite players" description="Players who sign up with your team code or open your invite link join right away. You can remove anyone from Roster.">
      {/* One code style for the app: large, tabular, Instrument Sans (.ch-set-code), with its Copy beside it. */}
      <div className="ch-inset ch-set-codebox">
        <div className="ch-set-codebox__c">
          <span>Team code</span>
          <b className="ch-set-code ch-num" aria-live="polite">
            {code}
          </b>
        </div>
        <div className="ch-set-codebox__acts">
          <Button size="sm" variant="primary" leftIcon={copied === 'code' ? Check : Copy} onClick={() => void copy('code')}>
            {copied === 'code' ? 'Copied' : 'Copy code'}
          </Button>
          <Button size="sm" leftIcon={copied === 'link' ? Check : Link2} onClick={() => void copy('link')}>
            {copied === 'link' ? 'Copied' : 'Copy link'}
          </Button>
          {canShare && (
            <Button size="sm" leftIcon={Share2} onClick={() => void share()}>
              Share
            </Button>
          )}
        </div>
      </div>
      <Row label="New code" help="Stops the current code from working right away. Anyone mid-join will need the new one.">
        <Button size="sm" variant="secondary" leftIcon={RefreshCw} busy={regen.pending} onClick={() => setConfirm(true)}>
          {regen.pending ? 'Making…' : 'Make a new code'}
        </Button>
      </Row>
      <Modal
        open={confirm}
        code="CH-8503"
        onClose={() => setConfirm(false)}
        icon={RefreshCw}
        title="Replace your team code?"
        description={`${code} stops working as soon as the new code is made. Share the new one with anyone who hasn’t joined yet.`}
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
      save={{ dirty: f.dirty, pending: save.pending, savedAt: f.savedAt, onReset: f.reset, onSave: () => void save.run(f.draft) }}
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
  // The database checks the order whether or not reminders are on (golf_team_settings_event_reminder_ordering), as
  // Fairway's panel does: times left out of order and then switched off would otherwise send and fail.
  const invalid = remindersProblem({ ...f.draft, enabled: true });
  return (
    <Card
      id="set-reminders"
      title="Event reminders"
      description="Players who haven’t replied get a nudge before each event."
      save={{ dirty: f.dirty, pending: save.pending, invalid, savedAt: f.savedAt, onReset: f.reset, onSave: () => void save.run(f.draft) }}
    >
      <Row label="Send reminders">
        <SettingSwitch label="Send reminders" hideLabel checked={f.draft.enabled} onChange={(v) => f.setDraft((d) => ({ ...d, enabled: v }))} />
      </Row>
      {/* Out of order with reminders off, the two times stay on screen so the problem can be fixed. */}
      {(f.draft.enabled || !!invalid) && (
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
