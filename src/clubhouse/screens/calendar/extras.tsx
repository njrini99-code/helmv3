'use client';

import { ArrowRight, ChevronLeft, Clock, FileText, Lock, Paperclip, Plane, Repeat, Text, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getItineraryForEvent } from '@/app/golf/actions/travel';
import { addCoachBlockedTime, deleteCoachBlockedTime } from '@/app/golf/actions/calendar-blocked-time';
import { attachDocumentToEvent, detachDocumentFromEvent, getEventDocuments } from '@/app/golf/actions/event-documents';
import { getDocuments } from '@/app/golf/actions/documents';
import { serializeRecurrenceRule } from '@/lib/golf/recurrence';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { DateField } from '../../ui/DateField';
import { TimeField } from '../../ui/TimeField';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { Tooltip } from '../../ui/Tooltip';
import { isOffline, normalise, useAction } from '../../lib/use-action';
import { chReport } from '../../lib/track';
import { newRequestId } from '../../data/recruiting-shape';
import { haptic } from '../../lib/haptics';
import { useChClock } from '../../lib/use-clock';
import { addDays, dayLabel, dayNum, dowOf, monthName, rangeLabel, type ChCalEvent } from './model';
import type { ChNow } from './views';

const toHHMM = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fromHHMM = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h ?? 0) + (m ?? 0) / 60;
};

function fileSize(b: number | null) {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(3, Math.floor(Math.log(b) / Math.log(1024)));
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0).replace(/\.0$/, '')} ${u[i]}`;
}

/* The coach's own busy time */

export function BusyDetail({ e, now, zoneLabel, onBack, onDeleted }: { e: ChCalEvent; now: ChNow; zoneLabel: string; onBack: () => void; onDeleted: () => void }) {
  const clock = useChClock();
  const [confirm, setConfirm] = useState(false);
  // Closing the question and leaving the block's panel follow a landed remove inside the action, so the toast's Retry does them too.
  const remove = useAction(
    'calendar.deleteBusy',
    async () => {
      const res = await deleteCoachBlockedTime(e.id);
      if (normalise(res).success) {
        setConfirm(false);
        onDeleted();
      }
      return res;
    },
    {
      done: `Removed · ${e.title}`,
      failed: `Couldn’t remove ${e.title}`,
      code: 'CH-6005',
    },
  );
  return (
    <div className="ch-in">
      <Button className="ch-in__back" size="sm" variant="ghost" leftIcon={ChevronLeft} onClick={onBack}>
        Today
      </Button>
      <div className="ch-in__plate" data-tone="champagne">
        <div className="ch-in__kick">
          <Badge tone="neutral">
            <Icon icon={Lock} size={11} />
            Your busy time
          </Badge>
        </div>
        <h2 className="ch-in__title" tabIndex={-1}>{e.title}</h2>
      </div>
      <div className="ch-in__facts">
        <div className="ch-in__fact">
          <Icon icon={Clock} size={15} />
          <div>
            {dayLabel(e.date, now.date)}
            <br />
            <span className="ch-num">{rangeLabel(e, clock)}</span>
            {!e.allDay && ` · ${zoneLabel}`}
          </div>
        </div>
        {e.recurring && (
          <div className="ch-in__fact">
            <Icon icon={Repeat} size={15} />
            <div>{e.recurring}</div>
          </div>
        )}
        {e.notes && (
          <div className="ch-in__fact">
            <Icon icon={Text} size={15} />
            <div>{e.notes}</div>
          </div>
        )}
      </div>
      <div className="ch-in__sec">
        <p className="ch-in__quiet">Only you see this block. It keeps your own schedule honest when you plan practice.</p>
      </div>
      <div className="ch-in__sec ch-in__foot">
        <Button variant="ghost" leftIcon={Trash2} onClick={() => setConfirm(true)}>
          {e.recurring ? 'Remove the series' : 'Remove busy time'}
        </Button>
      </div>
      <Modal
        code="CH-6502"
        open={confirm}
        onClose={() => setConfirm(false)}
        icon={Trash2}
        title={`Remove ${e.title}?`}
        description={e.recurring ? 'Every repeat of this block is removed.' : 'This block is removed from your calendar.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              feel="warning"
              busy={remove.pending}
              onClick={() => void remove.run()}
            >
              {remove.pending ? 'Removing…' : 'Remove'}
            </Button>
          </>
        }
      />
    </div>
  );
}

/**
 * The trip linked to an event (golf_travel_itineraries.event_id), as Fairway's event drawer shows it: "View itinerary"
 * with the destination, to Team Hub's Travel with that trip scrolled to. Read when the event opens, for every viewer (RLS scopes it to the
 * team). Nothing is drawn while it reads, when there is no trip, or when the read fails (reported, never shown as a trip).
 */
export function LinkedTrip({ eventId, preview }: { eventId: string; preview?: boolean }) {
  const [trip, setTrip] = useState<{ id: string; event_name: string; destination: string } | null>(null);
  useEffect(() => {
    let live = true;
    setTrip(null);
    if (preview) return;
    getItineraryForEvent(eventId)
      .then((res) => {
        if (!live) return;
        if (!res.success) chReport(new Error(res.error || 'linked trip read failed'), { surface: 'calendar.trip', severity: 'low' });
        setTrip(res.success ? (res.data ?? null) : null);
      })
      .catch((err) => {
        if (live) chReport(err, { surface: 'calendar.trip', severity: 'low' });
      });
    return () => {
      live = false;
    };
  }, [eventId, preview]);
  if (!trip) return null;
  return (
    <div className="ch-in__fact">
      <Icon icon={Plane} size={15} />
      <div>
        {/* Team Hub's Travel with the trip scrolled to: /travel redirects there in Clubhouse, and a layout's redirect
            can't carry `?trip=`. */}
        <Link className="ch-in__trip" href={`/golf/dashboard/team-hub?tab=travel&trip=${encodeURIComponent(trip.id)}`}>
          View itinerary · <b>{trip.destination || trip.event_name || 'the trip'}</b>
          <Icon icon={ArrowRight} size={13} />
        </Link>
      </div>
    </div>
  );
}

export function BusySheet({ open, onClose, onSaved, today }: { open: boolean; onClose: () => void; onSaved: (date: string) => void; today: string }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(today);
  const [win, setWin] = useState<[number, number]>([9, 10]);
  const [allDay, setAllDay] = useState(false);
  const [repeat, setRepeat] = useState<'none' | 'weekly'>('none');
  const [until, setUntil] = useState(addDays(today, 56));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDate(today);
    setWin([9, 10]);
    setAllDay(false);
    setRepeat('none');
    setUntil(addDays(today, 56));
    setTouched(false);
  }, [open, today]);
  const bad = !title.trim() || (!allDay && win[1] <= win[0]);
  // One request id per set of contents until an add lands: the same block sends the same id, whether the toast's
  // Retry replays it, Add is pressed again, or the sheet was closed and opened again in between, so a reply that was
  // lost after the server stored the block cannot add it a second time. Different contents get a new id, and so does
  // the next add once one has landed. A ref, not state: the toast's Retry runs an earlier render's action.
  const attempt = useRef<{ sig: string; id: string } | null>(null);
  const requestIdFor = (payload: unknown) => {
    const sig = JSON.stringify(payload);
    if (attempt.current?.sig === sig) return attempt.current.id;
    const id = newRequestId();
    attempt.current = { sig, id };
    return id;
  };
  // Closing the sheet and re-reading (or moving to the block's day) follow a landed add inside the action, so the toast's Retry does them too.
  const save = useAction(
    'calendar.addBusy',
    async () => {
      const block = {
        title: title.trim(),
        startDate: date,
        endDate: date,
        startTime: allDay ? undefined : toHHMM(win[0]),
        endTime: allDay ? undefined : toHHMM(win[1]),
        allDay,
        recurrenceRule: repeat === 'weekly' ? serializeRecurrenceRule({ frequency: 'weekly', weekdays: [new Date(`${date}T12:00:00Z`).getUTCDay()], until }) : undefined,
      };
      const res = await addCoachBlockedTime({ ...block, requestId: requestIdFor(block) });
      if (normalise(res).success) {
        attempt.current = null;
        onSaved(date);
      }
      return res;
    },
    () => ({ done: `Busy time added · ${title.trim()}`, failed: "Couldn’t add your busy time", hint: 'Your entry is still here. Try again.', code: 'CH-6006' }),
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={Lock}
      title="Add busy time"
      description="Blocks your own calendar. Only you see it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={save.pending}
            onClick={() => {
              setTouched(true);
              if (bad) {
                haptic('warning');
                return;
              }
              void save.run();
            }}
          >
            {save.pending ? 'Saving…' : 'Add busy time'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <label className="ch-field">
          <span className="ch-field__label">What</span>
          <input className="ch-input" placeholder="Recruiting call" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-invalid={touched && !title.trim()} />
          {touched && !title.trim() && (
            <span className="ch-field__help is-error" data-ch-code="CH-6103">
              Name the block so you know what it was.
            </span>
          )}
        </label>
        <div className="ch-ed__row">
          <DateField label="Date" row value={date} onChange={(v) => v && setDate(v)} />
          <TimeField label="Start time" disabled={allDay} value={toHHMM(win[0])} onChange={(v) => v && setWin([fromHHMM(v), Math.max(fromHHMM(v) + 0.25, win[1])])} />
          <TimeField label="End time" disabled={allDay} min={toHHMM(win[0] + 0.25)} value={toHHMM(win[1])} onChange={(v) => v && setWin([win[0], fromHHMM(v)])} />
        </div>
        {touched && !allDay && win[1] <= win[0] && (
          <span className="ch-field__help is-error" data-ch-code="CH-6104">
            End has to be after the start.
          </span>
        )}
        <div className="ch-ed__opts" style={{ marginTop: 0 }}>
          <label className="ch-switch">
            <input type="checkbox" checked={allDay} onChange={(e) => (haptic('select'), setAllDay(e.target.checked))} />
            <span className="ch-switch__t" aria-hidden="true" />
            All day
          </label>
          <Segmented<'none' | 'weekly'>
            label="Repeat"
            value={repeat}
            onChange={setRepeat}
            options={[
              { value: 'none', label: 'Once' },
              { value: 'weekly', label: `Weekly on ${dowOf(date)}` },
            ]}
          />
          {repeat === 'weekly' && (
            <div className="ch-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <span className="ch-field__label">Until</span>
              <DateField label="Until" value={until} min={date} onChange={(v) => v && setUntil(v)} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* Files on an event */

type EventFile = { id: string; title: string; url: string; size: number | null; note: string | null };

export function EventFiles({ eventId, teamId, canEdit, preview }: { eventId: string; teamId: string; canEdit: boolean; preview?: boolean }) {
  const toast = useToast();
  const [files, setFiles] = useState<EventFile[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    let live = true;
    setFailed(false);
    if (preview) {
      setFiles(eventId === 'e11' ? [{ id: 'd1', title: 'Pairings and tee times', url: '#', size: 84 * 1024, note: null }, { id: 'd2', title: 'Local rules', url: '#', size: 212 * 1024, note: null }] : []);
      return;
    }
    getEventDocuments(eventId)
      .then((r) => {
        if (!live) return;
        if (!r.success) {
          chReport(new Error(r.error || 'event files read failed'), { surface: 'calendar.files', severity: 'low' });
          setFailed(true);
          return;
        }
        setFiles((r.data ?? []).map((d) => ({ id: d.document.id, title: d.document.title, url: d.document.file_url, size: d.document.file_size, note: d.note })));
      })
      .catch((err) => {
        chReport(err, { surface: 'calendar.files' });
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [eventId, attempt, preview]);

  const detach = async (f: EventFile) => {
    // Same rule as every save (CH-1903): offline, nothing is sent and nothing changes.
    if (isOffline()) {
      haptic('error');
      toast({ tone: 'error', title: `Couldn’t remove ${f.title}: you’re offline`, body: 'Reconnect, then try again. Nothing was changed.', code: 'CH-1903' });
      return;
    }
    const prev = files;
    setFiles((s) => (s ?? []).filter((x) => x.id !== f.id));
    try {
      const r = await detachDocumentFromEvent(eventId, f.id);
      if (!r.success) throw new Error(r.error || 'detach failed');
      haptic('success');
      // Undo puts the file back. Like every save it sends nothing offline, and a refusal or a throw says so (CH-6009).
      const undoFailed = (why: string, err: unknown) => {
        chReport(err instanceof Error ? err : new Error(why), { surface: 'calendar.files', action: 'calendar.undoDetach', severity: 'low' });
        haptic('error');
        toast({ tone: 'error', title: `Couldn’t put ${f.title} back`, body: 'Attach it again from Documents.', code: 'CH-6009' });
      };
      toast({
        title: `Removed · ${f.title}`,
        action: {
          label: 'Undo',
          run: () => {
            if (isOffline()) {
              haptic('error');
              toast({ tone: 'error', title: `Couldn’t put ${f.title} back: you’re offline`, body: 'Reconnect, then attach it again from Documents. Nothing was changed.', code: 'CH-1903' });
              return;
            }
            attachDocumentToEvent(eventId, f.id, f.note ?? undefined)
              .then((x) => {
                if (x.success) setAttempt((a) => a + 1);
                else undoFailed(x.error || 'undo failed', null);
              })
              .catch((err) => undoFailed('undo threw', err));
          },
        },
      });
    } catch (err) {
      setFiles(prev);
      chReport(err, { surface: 'calendar.files', action: 'calendar.detachFile' });
      haptic('error');
      toast({ tone: 'error', title: `Couldn’t remove ${f.title}`, body: 'It’s still attached. Try again in a moment.', code: 'CH-6008' });
    }
  };

  // A player sees Files only when the event has some. Not while they load either: the placeholder then went away for
  // the usual event with none, and the sheet dropped 95px just after it rose (WebKit, 2026-10-15).
  if (!canEdit && !failed && !files?.length) return null;
  return (
    <div className="ch-in__sec">
      <div className="ch-in__sechead">
        <b>Files</b>
        {canEdit ? (
          <Button size="sm" variant="ghost" leftIcon={Paperclip} onClick={() => setPicking(true)}>
            Attach
          </Button>
        ) : (
          <span className="ch-num">{files?.length ?? ''}</span>
        )}
      </div>
      {failed ? (
        <InlineNotice code="CH-6207" title="Files didn’t load." body="Try again; the error has been reported." onRetry={() => setAttempt((a) => a + 1)} />
      ) : !files ? (
        <div aria-busy="true" data-ch-code="CH-6403">
          <Skeleton height={36} />
        </div>
      ) : !files.length ? (
        <p className="ch-in__quiet" data-ch-code="CH-6303">
          No files yet. Attach pairings, local rules or a travel sheet from Documents.
        </p>
      ) : (
        <div>
          {files.map((f) => (
            <div key={f.id} className="ch-in__file">
              <span className="ch-in__file-ic">
                <Icon icon={FileText} size={14} />
              </span>
              <a href={f.url} target="_blank" rel="noreferrer" style={{ minWidth: 0 }}>
                <b>{f.title}</b>
                <span>{[fileSize(f.size), f.note].filter(Boolean).join(' · ')}</span>
              </a>
              {canEdit ? (
                <Tooltip>
                  <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label={`Remove ${f.title}`} onClick={() => void detach(f)}>
                    <Icon icon={X} size={14} />
                  </button>
                </Tooltip>
              ) : (
                <span />
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (
        <FilePicker
          open={picking}
          teamId={teamId}
          attached={new Set((files ?? []).map((f) => f.id))}
          eventId={eventId}
          preview={preview}
          onClose={() => setPicking(false)}
          onAttached={() => {
            setPicking(false);
            setAttempt((a) => a + 1);
          }}
        />
      )}
    </div>
  );
}

function FilePicker({ open, teamId, eventId, attached, preview, onClose, onAttached }: { open: boolean; teamId: string; eventId: string; attached: Set<string>; preview?: boolean; onClose: () => void; onAttached: () => void }) {
  const [docs, setDocs] = useState<Array<{ id: string; title: string; size: number | null; category: string | null }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setFailed(false);
    setPick(null);
    setQ('');
    if (preview) {
      setDocs([
        { id: 'd1', title: 'Pairings and tee times', size: 84 * 1024, category: 'Tournament' },
        { id: 'd3', title: 'Hotel confirmation', size: 61 * 1024, category: 'Travel' },
        { id: 'd4', title: 'Practice plan · October', size: 40 * 1024, category: 'Practice' },
      ]);
      return;
    }
    getDocuments(teamId)
      .then((r) => {
        if (!live) return;
        if (r.error || !r.data) {
          chReport(new Error(r.error || 'documents read failed'), { surface: 'calendar.files', severity: 'low' });
          setFailed(true);
          return;
        }
        setDocs(r.data.map((d) => ({ id: d.id, title: d.title, size: d.file_size, category: d.category })));
      })
      .catch((err) => {
        chReport(err, { surface: 'calendar.files' });
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [open, teamId, preview, attempt]);
  const list = useMemo(() => (docs ?? []).filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase())), [docs, q]);
  // Closing the picker and reading the event's files again follow a landed attach inside the action, so the toast's Retry does them too.
  const attach = useAction(
    'calendar.attachFile',
    async (id: string) => {
      const res = await attachDocumentToEvent(eventId, id);
      if (normalise(res).success) onAttached();
      return res;
    },
    (id) => ({
      done: `Attached · ${docs?.find((d) => d.id === id)?.title ?? 'file'}`,
      failed: "Couldn’t attach the file",
      code: 'CH-6007',
    }),
  );
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      icon={Paperclip}
      title="Attach a file"
      description="From your team’s Documents. Everyone invited can open it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={attach.pending}
            disabled={!pick}
            onClick={() => {
              if (pick) void attach.run(pick);
            }}
          >
            {attach.pending ? 'Attaching…' : 'Attach'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 12 }}>
        <SearchField value={q} onChange={setQ} placeholder="Find a document" label="Find a document" />
        {failed ? (
          <InlineNotice code="CH-6208" title="Documents didn’t load." body="Try again; the error has been reported." onRetry={() => setAttempt((a) => a + 1)} />
        ) : !docs ? (
          <div style={{ display: 'grid', gap: 8 }} aria-busy="true" data-ch-code="CH-6404">
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : !docs.length ? (
          <p className="ch-in__quiet" data-ch-code="CH-6304">
            Your team has no documents yet. Upload one in Documents, then attach it here.
          </p>
        ) : (
          <div className="ch-cal-pick" role="listbox" aria-label="Documents">
            {list.map((d) => {
              const already = attached.has(d.id);
              return (
                <button key={d.id} type="button" role="option" aria-selected={pick === d.id} disabled={already} className="ch-pp__row" onClick={() => (haptic('select'), setPick(d.id))}>
                  <span className="ch-in__file-ic">
                    <Icon icon={FileText} size={14} />
                  </span>
                  <span className="ch-pp__name">
                    <b>{d.title}</b>
                    <span>{already ? 'Already attached' : [d.category, fileSize(d.size)].filter(Boolean).join(' · ')}</span>
                  </span>
                  <span />
                </button>
              );
            })}
            {!list.length && <div className="ch-pp__empty">No document matches “{q.trim()}”.</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}

export const busyLabel = (e: ChCalEvent) => `${dowOf(e.date)} ${dayNum(e.date)} ${monthName(e.date).slice(0, 3)}`;
