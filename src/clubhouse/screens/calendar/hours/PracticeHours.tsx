'use client';

import { CalendarCheck, ChevronLeft, ChevronRight, Clock, SlidersHorizontal, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useState, useTransition } from 'react';
import type { ChHoursData } from '../../../data/hours';
import { Avatar } from '../../../ui/Avatar';
import { Button, IconButton } from '../../../ui/Button';
import { ExportButton } from '../../../ui/ExportButton';
import { LargeTitle } from '../../../ui/LargeTitle';
import { InlineNotice } from '../../../ui/Notices';
import { BackLink, Section } from '../../../ui/Section';
import { SectionBoundary } from '../../../ui/SectionBoundary';
import { EmptyState } from '../../../ui/States';
import { PhoneTop } from '../../../shell/phone-chrome';
import { useChPhone } from '../../../lib/use-phone';
import { useChClock } from '../../../lib/use-clock';
import { useRefresh } from '../../../lib/use-refresh';
import { plural } from '../../../lib/plural';
import { addDays, dayNum, dowOf, rangeLabel } from '../model';
import { draftHours, hoursCell, hoursCsv, shortDay, weekTitle, type ChHoursFlag, type ChHoursLine, type ChHoursRow, type ChHoursWeek } from './model';
import { fmtHours, HOURS_DIVISIONS, limitsFor, limitsLine, SEGMENT_LABEL, type ChHoursLimits } from './rules';
import { AdjustSheet, LimitsSheet } from './sheets';

/**
 * Launch readiness F-03: Practice hours, under Calendar. The team's week of countable athletically related activity,
 * drafted from the calendar and attendance and read against the association's limits (rules.ts), one row a player with
 * the warnings in words; under it every event of the week with whether it counted, how much and why. A coach sets the
 * limits and changes how an event counts; a player sees their own week. A draft for the compliance office, which keeps
 * the official log, and the page says so.
 */

const PATH = '/golf/dashboard/calendar/hours';
const CALENDAR = '/golf/dashboard/calendar';

/** Warnings that belong to a day's cell (the rest are the week's). */
const DAY_FLAGS = new Set<ChHoursFlag['kind']>(['day', 'roundDay', 'civic', 'afterCompetition']);

const divisionLabel = (d: ChHoursLimits['division']) => HOURS_DIVISIONS.find((x) => x.value === d)?.label ?? 'NCAA Division I';

function sourceLine(data: ChHoursData): string {
  if (data.settingsFrom === 'saved') return 'Your saved limits';
  if (data.settingsFrom === 'division') return 'From your division in Settings > Team';
  return 'Division I until you set your limits';
}

/**
 * A week with nothing logged at all is no data, not seven days off: its cells are "—" (L-018). "Off" is for a day with nothing
 * counted in a week where the player did log hours, so it still means a real day off.
 */
const noHoursLogged = (r: ChHoursRow) => r.total === 0 && r.days.every((d) => d.off && !d.unknown);

function DayCell({ day, flags, none }: { day: ChHoursRow['days'][number]; flags: ChHoursFlag[]; none: boolean }) {
  const warn = flags.some((f) => f.date === day.date && DAY_FLAGS.has(f.kind));
  const text = day.off && !none ? 'Off' : hoursCell(day.hours, day.unknown);
  return (
    <span role="cell" className={'r ch-num ch-hrs-td' + (warn ? ' is-warn' : '') + (day.off ? ' is-off' : '') + (day.competition ? ' is-comp' : '')}>
      {text}
    </span>
  );
}

/** A player's warnings, each in words with the bylaw behind it. */
function Flags({ flags }: { flags: ChHoursFlag[] }) {
  return (
    <ul className="ch-hrs-flags__l">
      {flags.map((f, i) => (
        <li key={`${f.kind}-${f.date ?? 'wk'}-${i}`} className={f.check ? 'is-check' : undefined}>
          <span>{f.text}</span>
          {f.bylaw && <span className="ch-hrs-flags__by ch-num">Bylaw {f.bylaw}</span>}
        </li>
      ))}
    </ul>
  );
}

function weekCellText(r: ChHoursRow, limits: ChHoursLimits) {
  const unknown = r.days.some((d) => d.unknown);
  return limits.week != null ? `${hoursCell(r.total, unknown)} of ${fmtHours(limits.week)}` : hoursCell(r.total, unknown);
}

/** The desktop week: a row a player, a column a day, the week and the days off; a flagged player's warnings under the row. */
function HoursTable({ week, title }: { week: ChHoursWeek; title: string }) {
  const cols = week.days.length + 3;
  return (
    <div className="ch-hrs-tbl" role="table" aria-label={`Practice hours, ${title}`} data-ch-code="CH-6880">
      <div role="rowgroup">
        <div className="ch-hrs-tr ch-hrs-tr--head" role="row">
          <span role="columnheader">Player</span>
          {week.days.map((d) => (
            <span key={d} role="columnheader" className="r">
              <span className="ch-hrs-dow">{dowOf(d)}</span> <span className="ch-num">{dayNum(d)}</span>
            </span>
          ))}
          <span role="columnheader" className="r">
            Week
          </span>
          <span role="columnheader" className="r">
            Days off
          </span>
        </div>
      </div>
      {week.rows.map((r) => {
        const weekWarn = r.flags.some((f) => f.kind === 'week');
        const offWarn = r.flags.some((f) => f.kind === 'dayOff');
        return (
          <div key={r.id} role="rowgroup" className={r.flags.length ? 'is-flagged' : undefined}>
            <div className="ch-hrs-tr" role="row">
              <span role="rowheader" className="ch-hrs-who">
                <Avatar name={r.name} id={r.id} size="sm" />
                {/* L-070: the class under the name, so the name has the column's width and the class never wraps beside it. */}
                <span className="ch-hrs-who__t">
                  <span className="ch-hrs-who__n">{r.name}</span>
                  {r.year && <span className="ch-hrs-who__y">{r.year}</span>}
                </span>
              </span>
              {r.days.map((d) => (
                <DayCell key={d.date} day={d} flags={r.flags} none={noHoursLogged(r)} />
              ))}
              <span role="cell" className={'r ch-num ch-hrs-td ch-hrs-td--wk' + (weekWarn ? ' is-warn' : '')}>
                {weekCellText(r, week.limits)}
              </span>
              <span role="cell" className={'r ch-num ch-hrs-td' + (offWarn ? ' is-warn' : '')}>
                {noHoursLogged(r) ? hoursCell(0) : r.off}
              </span>
            </div>
            {r.flags.length > 0 && (
              <div className="ch-hrs-tr ch-hrs-flags" role="row">
                <span role="cell" aria-colspan={cols}>
                  <Flags flags={r.flags} />
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** The phone week: a player a block, the week's figure beside the name, the seven days under it, then any warnings. */
function HoursList({ week, self }: { week: ChHoursWeek; self: boolean }) {
  return (
    <ul className="ch-hrs-pl" aria-label="Players">
      {week.rows.map((r) => (
        <li key={r.id} className={'ch-hrs-pc' + (r.flags.length ? ' is-flagged' : '')}>
          <div className="ch-hrs-pc__h">
            {!self && <Avatar name={r.name} id={r.id} size="sm" />}
            <span className="ch-hrs-pc__n">{self ? 'Your week' : r.name}</span>
            <span className={'ch-hrs-pc__wk ch-num' + (r.flags.some((f) => f.kind === 'week') ? ' is-warn' : '')}>{weekCellText(r, week.limits)}</span>
          </div>
          <ol className="ch-hrs-pc__days" aria-label={`${self ? 'Your' : `${r.name}’s`} days`}>
            {r.days.map((d) => {
              const warn = r.flags.some((f) => f.date === d.date && DAY_FLAGS.has(f.kind));
              return (
                <li key={d.date} className={(warn ? 'is-warn' : '') + (d.off ? ' is-off' : '')}>
                  <span className="ch-hrs-pc__dow" aria-hidden="true">
                    {dowOf(d.date).slice(0, 1)}
                  </span>
                  <span className="ch-num">
                    <span className="ch-sr-only">{shortDay(d.date)}: </span>
                    {d.off && !noHoursLogged(r) ? 'Off' : hoursCell(d.hours, d.unknown)}
                  </span>
                </li>
              );
            })}
          </ol>
          {r.flags.length > 0 && <Flags flags={r.flags} />}
        </li>
      ))}
    </ul>
  );
}

/** Every event of the week by day: whether it counted, how much, why; a coach can change how one counts. */
function EventLines({ week, coach, onChange }: { week: ChHoursWeek; coach: boolean; onChange: ((l: ChHoursLine) => void) | null }) {
  const clock = useChClock();
  const byDay = week.days.map((d) => ({ date: d, lines: week.lines.filter((l) => l.date === d) })).filter((g) => g.lines.length);
  return (
    <div className="ch-hrs-ev">
      {byDay.map((g) => (
        <section key={g.date} className="ch-hrs-ev__day" aria-labelledby={`ch-hrs-d-${g.date}`}>
          <h3 id={`ch-hrs-d-${g.date}`} className="ch-hrs-ev__dt">
            {shortDay(g.date)}
          </h3>
          <ul className="ch-hrs-ev__l">
            {g.lines.map((l) => (
              <li key={l.key} className={'ch-hrs-ln' + (l.counted ? '' : ' is-out') + (l.adjustment ? ' is-changed' : '')}>
                <span className="ch-hrs-ln__main">
                  <span className="ch-hrs-ln__t">{l.title}</span>
                  <span className="ch-hrs-ln__m ch-num">
                    {rangeLabel(l.when, clock)}
                    {coach && l.counted && ` · ${plural(l.players, 'player')}`}
                  </span>
                  <span className="ch-hrs-ln__why">{l.why}</span>
                </span>
                <span className="ch-hrs-ln__h ch-num">
                  {l.counted && l.hours != null ? (
                    <>
                      {fmtHours(l.hours)}
                      <span className="ch-sr-only"> hours</span>
                    </>
                  ) : (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="ch-sr-only">No hours</span>
                    </>
                  )}
                </span>
                {onChange && (
                  <Button data-ctl="CTL-P006-105" size="sm" variant="ghost" className="ch-hrs-ln__act" onClick={() => onChange(l)} aria={{ label: `Change how ${l.title} counts` }}>
                    Change
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function PracticeHours({ data }: { data: ChHoursData }) {
  const phone = useChPhone();
  const router = useRouter();
  const { refresh, refreshing } = useRefresh();
  const [moving, startMove] = useTransition();
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [changing, setChanging] = useState<ChHoursLine | null>(null);
  const coach = data.role === 'coach';
  // A failed read of the saved limits must not offer a save of the defaults over them (CH-6285).
  const canSave = coach && !data.storeMissing && !data.settingsError;

  const limits = useMemo(() => limitsFor(data.settings, data.days[0]!), [data.settings, data.days]);
  const week = useMemo(
    () =>
      draftHours({
        days: data.days,
        events: data.events,
        people: data.people,
        marks: data.marks,
        adjustments: data.adjustments,
        limits,
        untimedHours: data.untimedHours,
        viewer: data.role,
      }),
    [data, limits],
  );
  const title = weekTitle(data.days);
  const thisWeek = data.days.includes(data.today);
  const go = (date: string | null) => startMove(() => router.replace(date ? `${PATH}?date=${date}` : PATH, { scroll: false }));
  const noRoster = coach && !data.membersError && data.people.length === 0;
  const blocked = data.eventsError || (coach && data.membersError);
  const busy = refreshing || moving;

  const kicker = [data.teamName, divisionLabel(limits.division), SEGMENT_LABEL[limits.segment]].filter(Boolean).join(' · ');
  const status =
    blocked || noRoster ? null : week.flagged ? (coach ? `${plural(week.flagged, 'player')} with a warning` : 'A warning this week') : 'No warnings this week';

  const stepper = (
    <div className="ch-hrs-step" role="group" aria-label="Week">
      <IconButton data-ctl="CTL-P006-106" icon={ChevronLeft} variant="secondary" label="Previous week" onClick={() => go(addDays(data.days[0]!, -7))} />
      <span className="ch-hrs-step__t ch-num" aria-live="polite">
        {title}
      </span>
      <IconButton data-ctl="CTL-P006-107" icon={ChevronRight} variant="secondary" label="Next week" onClick={() => go(addDays(data.days[0]!, 7))} />
      {!thisWeek && (
        <Button data-ctl="CTL-P006-108" size="sm" variant="ghost" leftIcon={CalendarCheck} onClick={() => go(null)}>
          This week
        </Button>
      )}
    </div>
  );

  const exportKey = !blocked && !noRoster && week.rows.length > 0 && (
    <ExportButton data-ctl="CTL-P006-109"
      file={() => hoursCsv(week, data.teamName)}
      done={() => `Practice hours exported · ${plural(week.rows.length, 'player')}`}
      failed="Couldn’t export the practice hours"
      code="CH-6082"
      surface="calendar.hours.export"
      icon={phone ? 'Export practice hours' : undefined}
    />
  );

  return (
    <main className={'ch-hrs' + (phone ? ' is-phone' : '')} aria-labelledby="ch-hrs-title" aria-busy={busy || undefined} data-canopy={phone ? undefined : ''}>
      {phone && (
        <PhoneTop
          title={coach ? 'Practice hours' : 'Your practice hours'}
          titleId="ch-hrs-title"
          back={{ label: 'Calendar', onBack: () => router.push(CALENDAR) }}
        />
      )}
      <header className="ch-hrs-h" data-canopy-head={phone ? undefined : 'tight'}>
        <div className="ch-hrs-h__t">
          {!phone && <BackLink data-ctl="CTL-P006-110" href={CALENDAR}>Calendar</BackLink>}
          <span className="ch-hrs-k">{kicker}</span>
          {!phone && <LargeTitle id="ch-hrs-title">{coach ? 'Practice hours' : 'Your practice hours'}</LargeTitle>}
          <p className="ch-hrs-lim ch-num">
            <span>{limitsLine(limits)}</span>
            <span className="ch-hrs-lim__src">
              {/* L-070: one plain sentence first, then where the limits come from. */}
              {limits.segmentAssumed ? `No season dates set, so every week counts as in season. ${sourceLine(data).replace(/^From /, 'Limits from ')}.` : sourceLine(data)}
            </span>
          </p>
        </div>
        <div className="ch-hrs-tools">
          {stepper}
          <span className="ch-hrs-tools__act">
            {canSave && (
              <Button data-ctl="CTL-P006-111" variant="secondary" leftIcon={SlidersHorizontal} onClick={() => setLimitsOpen(true)}>
                Limits
              </Button>
            )}
            {exportKey}
          </span>
        </div>
      </header>

      {status && (
        <p className={'ch-hrs-status' + (week.flagged ? ' is-warn' : '')} role="status" data-ch-code="CH-6881">
          {status}
        </p>
      )}

      {coach && data.storeMissing && (
        <div className="ch-hrs-note" role="note" data-ch-code="CH-6283">
          <b>Your own limits and changes can’t be saved yet</b>
          <span>
            This week is read against{' '}
            {sourceLine(data)
              .replace(/^From /, '')
              .replace(/^Your /, 'your ')}
            . Saving your limits and changing how an event counts arrive with the next update.
          </span>
        </div>
      )}

      {coach && data.settingsError && !data.storeMissing && (
        <InlineNotice
          code="CH-6285"
          title="Your saved limits didn’t load"
          body="This week is read against the defaults until they do. Limits and changes can’t be saved yet, so nothing you saved is replaced."
          onRetry={refresh}
          retrying={refreshing}
        />
      )}

      {data.eventsError ? (
        <InlineNotice
          code="CH-6280"
          title="The week’s events didn’t load"
          body="No hours are shown until they do. Nothing was changed."
          onRetry={refresh}
          retrying={refreshing}
        />
      ) : coach && data.membersError ? (
        <InlineNotice
          code="CH-6282"
          title="The roster didn’t load"
          body="Hours are drafted for each player, so none are shown until it does."
          onRetry={refresh}
          retrying={refreshing}
        />
      ) : noRoster ? (
        <EmptyState
          size="page"
          code="CH-6380"
          icon={Users}
          title="No players on the team yet"
          body="Each player’s practice hours show here once they join the roster."
        />
      ) : (
        <>
          {data.partial && (
            <InlineNotice
              code="CH-6281"
              title="Attendance didn’t load"
              body="This week is drafted from invitations alone, so a player marked absent may still be counted. Try again."
              onRetry={refresh}
              retrying={refreshing}
            />
          )}
          {week.noTimes.length > 0 && (
            <div className="ch-hrs-note is-warn" role="note" data-ch-code="CH-6381">
              <b>
                {week.noTimes.length === 1
                  ? `${week.noTimes[0]!.title} has no times, so its hours aren’t counted`
                  : `${week.noTimes.length} events have no times, so their hours aren’t counted`}
              </b>
              <span>
                {canSave
                  ? 'Figures marked + leave those hours out. Add times on the calendar, set hours for the event with Change, or set a standard for untimed practices in Limits.'
                  : 'Figures marked + leave those hours out until times are added.'}
              </span>
            </div>
          )}

          <SectionBoundary surface="calendar.hours.week" label="The week" code="CH-6284">
            {phone ? <HoursList week={week} self={!coach} /> : <HoursTable week={week} title={title} />}
          </SectionBoundary>

          <Section id="ch-hrs-ev" title="What counted" meta={week.lines.length ? 'Every event on the calendar this week' : undefined}>
            {week.lines.length === 0 ? (
              <EmptyState
                kind="first-run"
                code="CH-6382"
                compact
                icon={Clock}
                title="Nothing on the calendar this week"
                body={
                  coach
                    ? 'Practices, qualifiers, tournaments and meetings you add show here with their hours.'
                    : 'Events your coach invites you to will show up here with their hours.'
                }
              />
            ) : (
              <EventLines week={week} coach={coach} onChange={canSave ? setChanging : null} />
            )}
          </Section>
        </>
      )}

      <Section id="ch-hrs-rules" title="The rules this week is read against" meta={limits.source}>
        {limits.cites.length > 0 ? (
          <ul className="ch-hrs-cites">
            {limits.cites.map((c) => (
              <li key={c.bylaw + c.rule}>
                <span>{c.rule}</span>
                <span className="ch-hrs-cites__by ch-num">Bylaw {c.bylaw}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="ch-hrs-draft">
          {coach
            ? 'A draft from the calendar and attendance for your compliance office, which keeps the official record. Check it against what happened before anyone signs.'
            : 'A draft from the calendar and your attendance. Your coach and compliance office keep the official record.'}
        </p>
      </Section>

      {canSave && (
        <Fragment>
          <LimitsSheet
            open={limitsOpen}
            onClose={() => setLimitsOpen(false)}
            teamId={data.teamId}
            settings={data.settings}
            untimedHours={data.untimedHours}
            today={data.today}
            onSaved={refresh}
          />
          <AdjustSheet line={changing} onClose={() => setChanging(null)} teamId={data.teamId} onSaved={refresh} />
        </Fragment>
      )}
    </main>
  );
}
