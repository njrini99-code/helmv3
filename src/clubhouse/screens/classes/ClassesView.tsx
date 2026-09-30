'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Plus, Trash2, TriangleAlert, Upload } from 'lucide-react';
import { classNameOf, conflictsOf, groupConflicts, inTerm, orderClasses, shortDay, syncStartFor, toChClass, type ChClass, type ChClassesPage, type ChClassInput, type ChImportRow } from '../../data/classes-shape';
import { chTrail } from '../../lib/track';
import { friendlyReason, normalise, useAction, type ServerResult } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { PhoneTop, useBackFromMore } from '../../shell/phone-chrome';
import { Button } from '../../ui/Button';
import { InlineNotice } from '../../ui/Notices';
import { Modal } from '../../ui/Modal';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { EmptyState } from '../../ui/States';
import { ClassDetail } from './ClassDetail';
import { ClassForm } from './ClassForm';
import { ImportSchedule } from './ImportSchedule';
import { AddTile, ClassCard, CoachNote, OverlapsCard, SyncStatus, TermBar } from './parts';
import { newClassId, type ChClassesWrites, type ChRemoveAllData } from './writes';

const label = (c: { code: string; name: string }) => c.code || c.name;

/**
 * Classes (P012) for the player (design/handoff/Player - Classes.html,
 * classes.jsx `ClassesPage`; spec docs/clubhouse/phone/classes.md). The term at
 * a glance, every class as a card, this week's overlaps with the team, and the
 * sheets to add, edit, import and remove.
 *
 * Every write goes through `useAction`. Saving a class and putting it on the
 * calendar are two actions on purpose: a failed sync's Retry syncs, and never
 * inserts the class a second time. Everything that follows a write (the list, the
 * open sheet) happens inside the action, so a toast's Retry finishes it too. The
 * sync is started by the save but not waited on: it is its own action, with its
 * own Retry, and the sheet must not stay locked, nor "Still saving" fire, for a
 * save that is done.
 */
/** A remove whose calendar part landed and whose row delete did not (writes.remove). */
const offCalendar = (r: { success?: boolean; data?: unknown }) => !r.success && (r.data as { offCalendar?: boolean } | undefined)?.offCalendar === true;

export function ClassesView({ data, writes }: { data: ChClassesPage; writes: ChClassesWrites }) {
  const phone = useChPhone();
  const router = useRouter();
  const backFromMore = useBackFromMore();
  const [classes, setClasses] = useState(data.classes.list);
  // The classes whose last calendar sync failed, this visit only: no column holds it, so a reload starts clean.
  const [failedSync, setFailedSync] = useState<Set<string>>(() => new Set());
  // The first day each class was last put on the calendar from (see `syncStartFor`), so a Retry starts where the attempt that failed did.
  const startedFrom = useRef(new Map<string, string | undefined>());
  const [openId, setOpenId] = useState<string | null>(null);
  // `id` is the new class's row id, made when the sheet opens: a retry, or a second tap on Add after an answer was lost, reaches the same row.
  const [form, setForm] = useState<{ editing: ChClass | null; id: string } | null>(null);
  const [asking, setAsking] = useState<ChClass | null>(null);
  // "Delete all classes" is asked once for the whole list (CH-12503).
  const [askingAll, setAskingAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<{ classes: ChClass[]; skipped: string[] } | null>(null);
  // The server sent fresh classes (Try again): they win over what this page holds.
  useEffect(() => setClasses(data.classes.list), [data.classes.list]);

  const { term, week, todayIso } = data;
  const open = classes.find((c) => c.id === openId) ?? null;
  const mark = (ids: string[], failed: boolean) =>
    setFailedSync((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (failed) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  // ── Calendar sync: one action for one class or many (CH-12002) ─────────────
  const syncAction = async (list: ChClass[], starts: Record<string, string | undefined>): Promise<ServerResult<{ failed: string[]; total: number }>> => {
    const results = await Promise.all(
      list.map(async (c) => {
        const from = starts[c.id];
        const r = normalise(await writes.sync(c, from ? { semesterStartDate: from } : undefined));
        return { c, ok: r.success, error: r.success ? undefined : r.error };
      }),
    );
    mark(
      results.filter((x) => x.ok).map((x) => x.c.id),
      false,
    );
    const bad = results.filter((x) => !x.ok);
    mark(
      bad.map((x) => x.c.id),
      true,
    );
    return bad.length ? { success: false, error: bad[0]!.error, data: { failed: bad.map((x) => label(x.c)), total: list.length } } : { success: true };
  };
  const sync = useAction<[ChClass[], Record<string, string | undefined>], { failed: string[]; total: number }>(
    'classes.sync',
    syncAction,
    (list: ChClass[]) => ({
      done: '',
      failed: list.length === 1 ? `${label(list[0]!)} is saved, but not on your calendar` : `${list.length} classes are saved, but not all are on your calendar`,
      hint: 'Retry to add it now. If it keeps failing, open the class and save it again.',
      code: 'CH-12002',
    }),
    (res, c) => {
      if (res.success || !res.data?.failed.length) return c;
      const { failed, total } = res.data;
      const why = friendlyReason(res.error);
      return {
        ...c,
        failed: total === 1 ? c.failed : `${failed.length} of ${total} classes are saved, but not on your calendar`,
        hint: `${failed.slice(0, 3).join(', ')}${failed.length > 3 ? ' and more' : ''}${why ? `: ${why}` : '.'} Retry to try again.`,
      };
    },
  );
  /**
   * Every sync starts here. `starts` says, per class, the first day to put it on the calendar from; left out, each class starts where its last
   * attempt did, so a Retry (the header's, a sheet's) repeats what failed and the toast's Retry, which replays these arguments, does too.
   * A save passes none: it syncs the class's whole term, so a re-sync never removes the meetings already held.
   *
   * A refusal never reached the sync, so those classes still aren't on the calendar: offline (CH-1903), or busy, which `useAction` returns
   * with no toast when another sync is running (a class saved while an import is still being put on the calendar). Either way the class
   * is flagged and the header offers Retry sync, so a saved class never quietly stays off the calendar.
   */
  const syncClasses = async (list: ChClass[], starts?: Record<string, string | undefined>) => {
    const from = starts ?? Object.fromEntries(list.map((c) => [c.id, startedFrom.current.get(c.id)]));
    for (const c of list) startedFrom.current.set(c.id, from[c.id]);
    const r = await sync.run(list, from);
    if (!r.success && (r.error === 'offline' || r.error === 'busy'))
      mark(
        list.map((c) => c.id),
        true,
      );
    return r;
  };

  // ── Save a class (CH-12001) ────────────────────────────────────────────────
  const saveAction = async (input: ChClassInput, editing: ChClass | null, newId: string) => {
    const res = await writes.save(input, editing, newId);
    const r = normalise(res);
    if (r.success && r.data?.row) {
      const saved = toChClass(r.data.row, 'mist');
      setClasses((prev) => orderClasses(editing ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]));
      setForm(null);
      // The class exists now. Putting it on the calendar is its own action, so its Retry never repeats the insert, and it isn't waited on:
      // the sheet is free and "Class added" shows while the calendar is still being told (the header says so, CH-12403).
      void syncClasses([saved], {});
    }
    return res;
  };
  const save = useAction('classes.save', saveAction, (input: ChClassInput, editing: ChClass | null) => ({
    done: editing ? 'Class updated' : 'Class added',
    failed: `Couldn't ${editing ? 'update' : 'add'} ${label({ code: input.code, name: input.name })}`,
    hint: 'Nothing was changed. Check your connection and try again.',
    code: 'CH-12001',
  }));

  // ── Remove a class (CH-12003) ──────────────────────────────────────────────
  const removeAction = async (c: ChClass) => {
    const res = await writes.remove(c.id);
    // Off the calendar but still saved: flag it (Retry sync puts it back; Remove again finishes the job).
    if (offCalendar(res)) mark([c.id], true);
    if (normalise(res).success) {
      setClasses((prev) => prev.filter((x) => x.id !== c.id));
      mark([c.id], false);
      startedFrom.current.delete(c.id);
      setAsking((a) => (a?.id === c.id ? null : a));
      setOpenId((id) => (id === c.id ? null : id));
    }
    return res;
  };
  const remove = useAction('classes.remove', removeAction, (c: ChClass) => ({
    done: `${label(c)} removed`,
    failed: `Couldn't remove ${label(c)}`,
    hint: 'It is still on your schedule and your calendar. Try again.',
    code: 'CH-12003',
  }));

  // ── Delete all classes (CH-12005, CH-12006) ────────────────────────────────
  // The calendar first for every class, then the rows of those that came off it. Whatever the answer says is gone leaves the page, even when the
  // rest failed, so the list never shows a class the server has deleted (and the question's count is what is left). A class that is off the
  // calendar but still saved is flagged, as a single remove flags it. A Retry repeats the same ids: a class already gone counts as removed.
  const removeAllAction = async (ids: string[]) => {
    const res = await writes.removeAll(ids);
    const data = res.data;
    if (data) {
      const gone = new Set(data.removed);
      if (gone.size) {
        setClasses((prev) => prev.filter((x) => !gone.has(x.id)));
        mark(data.removed, false);
        for (const id of data.removed) startedFrom.current.delete(id);
        setOpenId((id) => (id && gone.has(id) ? null : id));
      }
      if (data.offCalendar.length) mark(data.offCalendar, true);
    }
    if (normalise(res).success) setAskingAll(false);
    return res;
  };
  const removeAll = useAction(
    'classes.removeAll',
    removeAllAction,
    (ids: string[]) => ({
      done: `${ids.length === 1 ? 'Class' : `All ${ids.length} classes`} deleted`,
      failed: "Couldn't delete your classes",
      hint: 'Nothing was deleted. Check your connection and try again.',
      code: 'CH-12005',
    }),
    (result, c) => {
      const data = (result.success ? undefined : result.data) as ChRemoveAllData | undefined;
      if (result.success || !data) return c;
      const { removed, kept, offCalendar } = data;
      const total = removed.length + kept.length + offCalendar.length;
      const nameOf = (id: string) => {
        const k = classes.find((x) => x.id === id);
        return k ? label(k) : 'A class';
      };
      const list = (ids: string[]) => `${ids.slice(0, 3).map(nameOf).join(', ')}${ids.length > 3 ? ' and more' : ''}`;
      // Nothing changed: every calendar removal failed, so every class was kept.
      if (!removed.length && !offCalendar.length) {
        const why = friendlyReason(kept[0]?.reason);
        return { ...c, hint: `${kept.length === 1 ? "It couldn't" : 'None of them could'} be taken off your calendar, so ${kept.length === 1 ? 'the class was' : `all ${kept.length} were`} kept${why ? `: ${why}` : '.'} Try again.` };
      }
      // Half-way: say what is gone, what stayed and what is off the calendar but still saved.
      const parts = [
        kept.length ? `${list(kept.map((k) => k.id))} couldn't be taken off your calendar, so ${kept.length === 1 ? 'it was' : 'they were'} kept.` : '',
        offCalendar.length ? `${list(offCalendar)} ${offCalendar.length === 1 ? 'is' : 'are'} off your calendar but still on your schedule.` : '',
        'Retry to finish.',
      ].filter(Boolean);
      return { ...c, failed: removed.length ? `${removed.length} of ${total} classes deleted` : "Couldn't finish deleting your classes", hint: parts.join(' '), code: 'CH-12006' };
    },
  );

  // ── Import (CH-12004): the rows are saved here, then put on the calendar ───
  const importAction = async (rows: ChImportRow[]) => {
    const res = await writes.importRows(rows);
    const r = normalise(res);
    if (r.success) {
      // A skipped class the page has never seen was saved by an earlier attempt whose answer was lost: it joins the page
      // and goes on the calendar like a new one. A class the page already shows stays skipped.
      const recovered = (r.data?.known ?? []).filter((row) => !classes.some((c) => c.id === row.id)).map((row) => toChClass(row, 'mist'));
      const added = [...(r.data?.rows ?? []).map((row) => toChClass(row, 'mist')), ...recovered];
      setClasses((prev) => orderClasses([...prev, ...added.filter((a) => !prev.some((p) => p.id === a.id))]));
      setImported({ classes: added, skipped: (r.data?.skipped ?? []).filter((name) => !recovered.some((c) => classNameOf(c.code, c.name) === name)) });
      // Like the current importer, each class starts from next Monday, so a schedule read mid-term doesn't fill the calendar with meetings already held,
      // but only inside its own term (a class in next term, or one imported before its term begins, has the whole term). Not waited on, like a save.
      if (added.length) void syncClasses(added, Object.fromEntries(added.map((c) => [c.id, syncStartFor(c.semester, term.label, todayIso)])));
    }
    return res;
  };
  const doImport = useAction('classes.import', importAction, {
    done: '',
    failed: "Couldn't import your schedule",
    hint: 'Nothing was saved. Check your connection and try again.',
    code: 'CH-12004',
  });

  // ── What the sheets and cards need ─────────────────────────────────────────
  const conflicts = useMemo(
    () =>
      week.error
        ? []
        : conflictsOf(
            classes.filter((c) => inTerm(c, term)),
            week.events,
            week.dates,
          ),
    [classes, week, term],
  );
  const groups = useMemo(() => groupConflicts(conflicts, classes), [conflicts, classes]);
  const failedList = classes.filter((c) => failedSync.has(c.id));
  const importedNow = imported && { ...imported, classes: imported.classes.map((c) => classes.find((x) => x.id === c.id) ?? c) };
  const importSync = sync.pending ? 'syncing' : importedNow?.classes.some((c) => failedSync.has(c.id)) ? 'failed' : 'ok';
  // First run. A load that failed is checked before this wherever it matters (the notice is drawn first, and the header offers nothing), so an empty list from a failed read is never called "no classes".
  const nothing = classes.length === 0;

  const startAdd = () => {
    chTrail('classes add');
    setForm({ editing: null, id: newClassId() });
  };
  const startImport = () => {
    chTrail('classes import');
    setImported(null);
    setImporting(true);
  };
  // One write at a time: a save, an import or a calendar sync running beside a delete of everything would put back what was just taken off.
  const busy = save.pending || remove.pending || doImport.pending || sync.pending || removeAll.pending;
  const inOtherTerm = classes.filter((c) => !inTerm(c, term)).length;
  const askRemove = (c: ChClass) => {
    setOpenId(null);
    setAsking(c);
  };

  return (
    <main className={'ch-cl' + (phone ? ' is-phone' : '')} aria-labelledby="ch-cl-title">
      {/* Phone: Classes opens from More (D-66), so the top bar goes back there. */}
      {phone && <PhoneTop title="Classes" back={{ label: 'More', onBack: backFromMore }} />}
      <header className="ch-cl-h">
        <div>
          <span className="ch-cl-k">
            {term.label} · {shortDay(term.start)} – {shortDay(term.end)}
          </span>
          <h1 id="ch-cl-title">Classes</h1>
        </div>
        {/* Neither list is offered while the classes didn't load: an add or an import would land beside a schedule the page can't show (CH-12201). */}
        {!nothing && !data.classes.error && (
          <div className="ch-cl-h__a">
            <SyncStatus failed={failedList.length} syncing={sync.pending} onRetry={() => void syncClasses(failedList)} />
            <Button leftIcon={Upload} onClick={startImport}>
              Import schedule
            </Button>
            <Button variant="primary" leftIcon={Plus} onClick={startAdd}>
              Add class
            </Button>
          </div>
        )}
      </header>

      {data.classes.error ? (
        <InlineNotice code="CH-12201" title="Your classes didn't load" body="Nothing is lost. Your classes are still saved; try again in a moment." onRetry={() => router.refresh()} />
      ) : nothing ? (
        <EmptyState
          size="page"
          code="CH-12301"
          icon={GraduationCap}
          title="Add your class schedule"
          body="Import a screenshot of your schedule and we'll add every class. Your coach can see when you're busy, so practice and travel get planned around class."
          action={
            <Button variant="primary" leftIcon={Upload} onClick={startImport}>
              Import schedule
            </Button>
          }
          secondaryAction={
            <Button leftIcon={Plus} onClick={startAdd}>
              Add a class
            </Button>
          }
        />
      ) : (
        <>
          <SectionBoundary surface="classes.term" label="The term overview" code="CH-12203">
            <TermBar term={term} classes={classes} todayIso={todayIso} weekDates={week.dates} overlaps={conflicts.length} overlapsError={week.error} />
          </SectionBoundary>
          <div className="ch-cl-grid">
            <SectionBoundary surface="classes.deck" label="Your classes" code="CH-12203">
              {/* CH-12801: the page is labelled by "Classes"; each card is one button. */}
              <div className="ch-cl-deck">
                {classes.map((c) => (
                  <ClassCard
                    key={c.id}
                    c={c}
                    todayIso={todayIso}
                    term={term}
                    overlaps={conflicts.filter((x) => x.classId === c.id)}
                    unsynced={failedSync.has(c.id)}
                    onOpen={(x) => {
                      chTrail('classes open');
                      setOpenId(x.id);
                    }}
                  />
                ))}
                <AddTile onAdd={startAdd} />
              </div>
              {/* CH-12503: the way out of a whole schedule, quiet and below the deck, red because it deletes (D-42). The warning comes before the question (CH-12704). */}
              <div className="ch-cl-delall">
                <Button
                  variant="ghost"
                  className="ch-cl-danger"
                  leftIcon={Trash2}
                  feel="warning"
                  disabled={busy}
                  onClick={() => {
                    chTrail('classes delete all');
                    setAskingAll(true);
                  }}
                >
                  Delete all classes
                </Button>
              </div>
            </SectionBoundary>
            <SectionBoundary surface="classes.side" label="This week's overlaps" code="CH-12203">
              <div className="ch-cl-side">
                <OverlapsCard groups={groups} error={week.error} onRetry={() => router.refresh()} />
                <CoachNote />
              </div>
            </SectionBoundary>
          </div>
        </>
      )}

      <ClassDetail
        c={open}
        todayIso={todayIso}
        term={term}
        week={week}
        unsynced={open ? failedSync.has(open.id) : false}
        syncing={sync.pending}
        onClose={() => setOpenId(null)}
        onEdit={(c) => {
          setOpenId(null);
          setForm({ editing: c, id: '' });
        }}
        onRemove={askRemove}
        onRetrySync={(c) => void syncClasses([c])}
      />
      <ClassForm
        open={!!form}
        editing={form?.editing ?? null}
        classes={classes}
        term={term}
        week={week}
        saving={save.pending}
        onSave={(input, editing) => save.run(input, editing, form?.id || newClassId())}
        onClose={() => setForm(null)}
      />
      <ImportSchedule
        open={importing}
        onClose={() => setImporting(false)}
        read={writes.read}
        onImport={(rows) => doImport.run(rows)}
        importing={doImport.pending}
        imported={importedNow}
        syncState={importSync}
        term={term}
        week={week}
      />
      <Modal
        open={!!asking}
        onClose={() => setAsking(null)}
        icon={TriangleAlert}
        code="CH-12501"
        title="Remove this class?"
        description={asking ? `${label(asking)} comes off your schedule and your calendar. This can't be undone.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setAsking(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              disabled={remove.pending}
              feel={null}
              onClick={() => {
                if (asking) void remove.run(asking);
              }}
            >
              {remove.pending ? 'Removing' : 'Remove class'}
            </Button>
          </>
        }
      />
      <Modal
        open={askingAll}
        onClose={() => {
          if (!removeAll.pending) setAskingAll(false);
        }}
        icon={TriangleAlert}
        code="CH-12503"
        title="Delete all classes?"
        description={
          classes.length === 1
            ? `${classes[0] ? label(classes[0]) : 'This class'} comes off your schedule and your calendar. This can't be undone.`
            : `All ${classes.length} classes come off your schedule and your calendar${inOtherTerm ? `, including ${inOtherTerm} from another term` : ''}. This can't be undone.`
        }
        footer={
          <>
            <Button variant="ghost" disabled={removeAll.pending} onClick={() => setAskingAll(false)}>
              Keep them
            </Button>
            <Button variant="danger" disabled={removeAll.pending || classes.length === 0} feel={null} onClick={() => void removeAll.run(classes.map((c) => c.id))}>
              {removeAll.pending ? 'Deleting' : 'Delete all classes'}
            </Button>
          </>
        }
      />
    </main>
  );
}
