'use client';

import { ChevronLeft, Clock, FileText, Lock, Paperclip, Repeat, Text, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { addCoachBlockedTime, deleteCoachBlockedTime } from '@/app/golf/actions/golf';
import { attachDocumentToEvent, detachDocumentFromEvent, getEventDocuments } from '@/app/golf/actions/event-documents';
import { getDocuments } from '@/app/golf/actions/documents';
import { serializeRecurrenceRule } from '@/lib/golf/recurrence';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { InlineNotice } from '../../ui/Notices';
import { SearchField } from '../../ui/SearchField';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/States';
import { useToast } from '../../ui/Toast';
import { useAction } from '../../lib/use-action';
import { chReport } from '../../lib/track';
import { haptic } from '../../lib/haptics';
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
  const [confirm, setConfirm] = useState(false);
  const remove = useAction('calendar.deleteBusy', () => deleteCoachBlockedTime(e.id), {
    done: `Removed · ${e.title}`,
    failed: `Couldn't remove ${e.title}`,
  });
  return (
    <div className="ch-in">
      <Button className="ch-in__back" size="sm" variant="ghost" leftIcon={ChevronLeft} onClick={onBack}>
        Today
      </Button>
      <div className="ch-in__kick">
        <Badge tone="neutral">
          <Icon icon={Lock} size={11} />
          Your busy time
        </Badge>
      </div>
      <h2 className="ch-in__title">{e.title}</h2>
      <div className="ch-in__facts">
        <div className="ch-in__fact">
          <Icon icon={Clock} size={15} />
          <div>
            {dayLabel(e.date, now.date)}
            <br />
            <span className="ch-num">{rangeLabel(e)}</span>
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
              disabled={remove.pending}
              onClick={async () => {
                const r = await remove.run();
                if (r.success) {
                  setConfirm(false);
                  onDeleted();
                }
              }}
            >
              {remove.pending ? 'Removing…' : 'Remove'}
            </Button>
          </>
        }
      />
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
  const save = useAction(
    'calendar.addBusy',
    () =>
      addCoachBlockedTime({
        title: title.trim(),
        startDate: date,
        endDate: date,
        startTime: allDay ? undefined : toHHMM(win[0]),
        endTime: allDay ? undefined : toHHMM(win[1]),
        allDay,
        recurrenceRule: repeat === 'weekly' ? serializeRecurrenceRule({ frequency: 'weekly', weekdays: [new Date(`${date}T12:00:00Z`).getUTCDay()], until }) : undefined,
      }),
    () => ({ done: `Busy time added · ${title.trim()}`, failed: "Couldn't add your busy time", hint: 'Your entry is still here. Try again.' }),
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
            disabled={save.pending}
            onClick={async () => {
              setTouched(true);
              if (bad) {
                haptic('warning');
                return;
              }
              const r = await save.run();
              if (r.success) onSaved(date);
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
          {touched && !title.trim() && <span className="ch-field__help is-error">Name the block so you know what it was.</span>}
        </label>
        <div className="ch-ed__row">
          <input className="ch-input" type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
          <input className="ch-input" type="time" aria-label="Start time" step={900} disabled={allDay} value={toHHMM(win[0])} onChange={(e) => e.target.value && setWin([fromHHMM(e.target.value), Math.max(fromHHMM(e.target.value) + 0.25, win[1])])} />
          <input className="ch-input" type="time" aria-label="End time" step={900} disabled={allDay} value={toHHMM(win[1])} onChange={(e) => e.target.value && setWin([win[0], fromHHMM(e.target.value)])} />
        </div>
        {touched && !allDay && win[1] <= win[0] && <span className="ch-field__help is-error">End has to be after the start.</span>}
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
            <label className="ch-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <span className="ch-field__label">Until</span>
              <input className="ch-input" type="date" value={until} min={date} onChange={(e) => e.target.value && setUntil(e.target.value)} />
            </label>
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
    const prev = files;
    setFiles((s) => (s ?? []).filter((x) => x.id !== f.id));
    try {
      const r = await detachDocumentFromEvent(eventId, f.id);
      if (!r.success) throw new Error(r.error || 'detach failed');
      haptic('commit');
      toast({
        title: `Removed · ${f.title}`,
        action: {
          label: 'Undo',
          run: () =>
            void attachDocumentToEvent(eventId, f.id, f.note ?? undefined).then((x) => {
              if (x.success) setAttempt((a) => a + 1);
              else toast({ tone: 'error', title: `Couldn't put ${f.title} back`, body: 'Attach it again from Documents.' });
            }),
        },
      });
    } catch (err) {
      setFiles(prev);
      chReport(err, { surface: 'calendar.files', action: 'calendar.detachFile' });
      haptic('error');
      toast({ tone: 'error', title: `Couldn't remove ${f.title}`, body: 'It’s still attached. Try again in a moment.' });
    }
  };

  if (!canEdit && files && !files.length) return null;
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
        <InlineNotice title="Files didn't load." body="Try again; the error has been reported." onRetry={() => setAttempt((a) => a + 1)} />
      ) : !files ? (
        <Skeleton height={36} />
      ) : !files.length ? (
        <p className="ch-in__quiet">No files yet. Attach pairings, local rules or a travel sheet from Documents.</p>
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
                <button type="button" className="ch-btn ch-btn--ghost ch-iconbtn ch-btn--sm" aria-label={`Remove ${f.title}`} onClick={() => void detach(f)}>
                  <Icon icon={X} size={14} />
                </button>
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
  }, [open, teamId, preview]);
  const list = useMemo(() => (docs ?? []).filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase())), [docs, q]);
  const attach = useAction('calendar.attachFile', (id: string) => attachDocumentToEvent(eventId, id), (id) => ({
    done: `Attached · ${docs?.find((d) => d.id === id)?.title ?? 'file'}`,
    failed: "Couldn't attach the file",
  }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={520}
      icon={Paperclip}
      title="Attach a file"
      description="From your team's Documents. Everyone invited can open it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!pick || attach.pending}
            onClick={async () => {
              if (!pick) return;
              const r = await attach.run(pick);
              if (r.success) onAttached();
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
          <InlineNotice title="Documents didn't load." body="Close this and try again; the error has been reported." />
        ) : !docs ? (
          <div style={{ display: 'grid', gap: 8 }} aria-busy="true">
            <Skeleton height={44} />
            <Skeleton height={44} />
          </div>
        ) : !docs.length ? (
          <p className="ch-in__quiet">Your team has no documents yet. Upload one in Documents, then attach it here.</p>
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
