'use client';

import { Check, CircleAlert, CloudOff, FileQuestion, FileWarning, FileX, Lightbulb, SearchX, Sparkles, Trash2, Upload, WifiOff, TriangleAlert } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  CH_TONES,
  calendarGap,
  conflictsOf,
  daysLabel,
  gapReason,
  groupConflicts,
  inTerm,
  joinList,
  shortDay,
  tabParts,
  termEnd,
  timeRange,
  type ChClass,
  type ChImportRow,
  type ChTerm,
  type ChWeek,
} from '../../data/classes-shape';
import { haptic } from '../../lib/haptics';
import { CH_SLOW_SAVE_AFTER, isOffline } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { Segmented } from '../../ui/Segmented';
import { EmptyState } from '../../ui/States';
import { screenFile, type ChReadFail, type ChReadResult, type ChReadSource } from './import-read';

type Step = 'pick' | 'reading' | 'review' | 'error';
type Tab = 'file' | 'paste';

/** The board's error views (`ERR` in classes.jsx), one per way a read can fail. */
const FAIL: Record<ChReadFail, { icon: LucideIcon; title: string; code: string; body: string }> = {
  notSchedule: { icon: FileX, title: "This doesn't look like a class schedule", code: 'CH-12113', body: 'Upload a screenshot of your class schedule from your student portal.' },
  tooLarge: { icon: FileWarning, title: 'That file is too large', code: 'CH-12111', body: 'Use a file under 12 MB. A screenshot of the schedule page is usually under 2 MB.' },
  unsupported: { icon: FileQuestion, title: "We can't read that file type", code: 'CH-12112', body: 'Use a PNG, JPG or WebP screenshot, a PDF or a TXT file, or paste the text.' },
  fault: { icon: CloudOff, title: "Reading the schedule didn't finish", code: 'CH-12204', body: 'Your schedule can still be added with Paste text.' },
  none: { icon: SearchX, title: 'No classes found', code: 'CH-12114', body: "We read it but couldn't find course codes or times. Try pasting your schedule text." },
  offline: { icon: WifiOff, title: "You're offline", code: 'CH-12901', body: 'Reading a screenshot needs a connection. Reconnect and try again, or paste the text, which works offline.' },
  empty: { icon: SearchX, title: 'Nothing to read', code: 'CH-12110', body: 'Paste your schedule text first.' },
};

/**
 * Import a schedule (classes.jsx `ImportModal`): a screenshot, PDF or TXT file
 * or pasted text is read, reviewed row by row, then imported. Nothing is saved
 * until the person confirms, and the import itself is the page's action (so a
 * failed save has a toast with Retry); this sheet only draws the steps.
 * The board's review row has an Edit pencil; it isn't drawn, because each row can
 * be edited from its class once imported. The board's "Image received, Finding
 * classes, Matching times" steps are timed animation, not progress, so the read
 * says only what it is doing.
 */
export function ImportSchedule({
  open,
  onClose,
  read,
  onImport,
  importing,
  imported,
  syncState,
  term,
  week,
}: {
  open: boolean;
  onClose: () => void;
  read: (source: ChReadSource) => Promise<ChReadResult>;
  onImport: (rows: ChImportRow[]) => unknown;
  importing: boolean;
  /** Set once the import has saved: the classes now on the schedule, and the ones skipped as already there. */
  imported: { classes: ChClass[]; skipped: string[] } | null;
  /** Whether the imported classes have reached the calendar. */
  syncState: 'syncing' | 'failed' | 'ok';
  term: ChTerm;
  week: ChWeek;
}) {
  const [was, setWas] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [tab, setTab] = useState<Tab>('file');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ChImportRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [fail, setFail] = useState<{ kind: ChReadFail; message: string } | null>(null);
  const [slow, setSlow] = useState(false);
  const [pasteEmpty, setPasteEmpty] = useState(false);
  const [over, setOver] = useState(false);
  const token = useRef(0);
  const last = useRef<ChReadSource | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Each time the sheet opens it starts at the beginning.
  if (open !== was) {
    setWas(open);
    if (open) {
      setStep('pick');
      setTab('file');
      setText('');
      setRows([]);
      setWarnings([]);
      setFail(null);
      setSlow(false);
      setPasteEmpty(false);
    }
  }

  const close = () => {
    // A read still running is left to finish unheard.
    token.current += 1;
    onClose();
  };
  const failWith = (kind: ChReadFail, message?: string) => {
    haptic('error');
    setFail({ kind, message: message || FAIL[kind].body });
    setStep('error');
  };
  const run = async (source: ChReadSource) => {
    last.current = source;
    if (source.kind === 'file') {
      const s = screenFile(source.file);
      if (!s.ok) return failWith(s.kind);
      // A screenshot is read on the server; a PDF or a text file is read here.
      if (s.kind === 'image' && isOffline()) return failWith('offline');
    }
    const mine = ++token.current;
    setStep('reading');
    setSlow(false);
    // CH-12902: a read that hasn't answered says so once.
    const timer = window.setTimeout(() => token.current === mine && setSlow(true), CH_SLOW_SAVE_AFTER);
    let result: ChReadResult;
    try {
      result = await read(source);
    } catch {
      result = { ok: false, kind: 'fault', message: FAIL.fault.body };
    }
    window.clearTimeout(timer);
    if (token.current !== mine) return;
    if (result.ok) {
      setRows(result.rows);
      setWarnings(result.warnings);
      setStep('review');
    } else failWith(result.kind, result.message);
  };
  const choose = (files: FileList | null) => {
    const f = files?.[0];
    if (f) void run({ kind: 'file', file: f });
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files);
  };

  const done = imported != null;
  const title = done ? (imported.classes.length ? 'Schedule imported' : 'Nothing new to import') : step === 'review' ? 'Review your schedule' : 'Import schedule';
  const description = done ? 'Saved to your schedule' : step === 'review' ? 'Check each class before it goes on your calendar' : 'Screenshot, upload or paste your class schedule';
  const credits = rows.reduce((a, r) => a + (r.credits ?? 0), 0);
  const dayCount = new Set(rows.flatMap((r) => r.days)).size;
  const looks = rows.filter((r) => r.look).length;

  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      width={620}
      footer={
        done ? (
          <Button variant="primary" onClick={close}>
            View classes
          </Button>
        ) : step === 'review' ? (
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRows([]);
                setStep('pick');
              }}
            >
              Start over
            </Button>
            <Button variant="primary" leftIcon={Check} disabled={!rows.length || importing} onClick={() => void onImport(rows)}>
              {importing ? 'Importing' : `Import ${rows.length} ${rows.length === 1 ? 'class' : 'classes'}`}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="ch-cl-imp">
        {done ? (
          <ImportedView imported={imported} syncState={syncState} term={term} week={week} />
        ) : step === 'reading' ? (
          // CH-12402: a scan over a page while the schedule is read.
          <div className="ch-cl-read" role="status" data-ch-code="CH-12402">
            <div className="ch-cl-read__doc" aria-hidden="true">
              <span className="ch-cl-read__scan" />
              {Array.from({ length: 6 }, (_, i) => (
                <i key={i} style={{ width: `${50 + ((i * 37) % 45)}%` }} />
              ))}
            </div>
            <b>Reading your schedule…</b>
            <span>Finding course codes, days, times and rooms</span>
            {slow && (
              <span className="ch-cl-read__slow" data-ch-code="CH-12902">
                This is taking longer than usual. Keep this open.
              </span>
            )}
          </div>
        ) : step === 'error' && fail ? (
          <div className="ch-cl-err" role="alert" data-ch-code={FAIL[fail.kind].code}>
            <span className={'ch-cl-err__ic' + (fail.kind === 'none' ? ' is-quiet' : '')}>
              <Icon icon={FAIL[fail.kind].icon} size={22} />
            </span>
            <b>{FAIL[fail.kind].title}</b>
            <p>{fail.message}</p>
            <div className="ch-cl-err__a">
              {fail.kind === 'offline' && last.current ? (
                <Button variant="primary" onClick={() => void run(last.current!)}>
                  Try again
                </Button>
              ) : fail.kind === 'notSchedule' || fail.kind === 'tooLarge' || fail.kind === 'unsupported' ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    setTab('file');
                    setStep('pick');
                  }}
                >
                  Choose another file
                </Button>
              ) : null}
              <Button
                variant={fail.kind === 'fault' || fail.kind === 'none' ? 'primary' : 'ghost'}
                onClick={() => {
                  setTab('paste');
                  setStep('pick');
                }}
              >
                {fail.kind === 'none' ? 'Paste text' : 'Paste text instead'}
              </Button>
            </div>
          </div>
        ) : step === 'review' ? (
          <>
            <dl className="ch-cl-rv__sum">
              {(
                [
                  ['Classes', rows.length],
                  ['Credits', credits],
                  ['Days a week', dayCount],
                  ['Need a look', looks],
                ] as const
              ).map(([k, n]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd className="ch-num">{n}</dd>
                </div>
              ))}
            </dl>
            {warnings.length > 0 && (
              <div className="ch-cl-clash" role="status">
                <Icon icon={TriangleAlert} size={15} />
                <span>
                  <b>Worth a look</b>
                  {warnings.join(' ')}
                </span>
              </div>
            )}
            {rows.length === 0 ? (
              <EmptyState compact title="Every class was removed" body="Start over to read the schedule again." />
            ) : (
              <ul className="ch-cl-rv" aria-label="Classes found">
                {rows.map((r, i) => {
                  const tab = tabParts({ code: r.code, name: r.name });
                  const meta = [daysLabel(r.days) || 'No days', timeRange(r.start, r.end) ?? 'No time', [r.building, r.room].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
                  return (
                    <li key={r.key} className={'ch-cl-rv__r' + (r.look ? ' is-check' : '')}>
                      <span className={`ch-cl-rv__tab ch-cl-t-${CH_TONES[i % CH_TONES.length]}`}>
                        {tab.top}
                        <b>{tab.bottom}</b>
                      </span>
                      <span className="ch-cl-rv__b">
                        <b>{r.name}</b>
                        <span>{meta}</span>
                        {r.look && (
                          <em>
                            <Icon icon={CircleAlert} size={12} />
                            {r.look}. Add it from the class after importing.
                          </em>
                        )}
                      </span>
                      <button type="button" className="ch-cl-rv__x" aria-label={`Remove ${r.code || r.name}`} onClick={() => setRows((xs) => xs.filter((x) => x.key !== r.key))}>
                        <Icon icon={Trash2} size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        ) : (
          <>
            {/* CH-12705: switching between a file and pasted text is a selection tap (Segmented). */}
            <Segmented
              label="How to add your schedule"
              value={tab}
              onChange={(t) => {
                setTab(t);
                setPasteEmpty(false);
              }}
              options={[
                { value: 'file', label: 'Screenshot or file' },
                { value: 'paste', label: 'Paste text' },
              ]}
            />
            {tab === 'file' ? (
              <>
                {/* CH-12805: the drop zone is a real button, so the keyboard opens the file picker too. */}
                <button
                  type="button"
                  className={'ch-cl-drop' + (over ? ' is-over' : '')}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(true);
                  }}
                  onDragLeave={() => setOver(false)}
                  onDrop={drop}
                >
                  <span className="ch-cl-drop__art" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <span>
                      <Icon icon={Upload} size={20} />
                    </span>
                  </span>
                  <b>Drop your schedule here</b>
                  <em>or choose a file · PNG, JPG, WebP, PDF or TXT · up to 12 MB</em>
                  <span className="ch-cl-drop__tip">
                    <Icon icon={Lightbulb} size={13} />
                    Tip: a screenshot of the week view in your student portal reads best.
                  </span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  hidden
                  aria-label="Choose a schedule file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,.heic,.heif,.pdf,application/pdf,.txt,text/plain"
                  onChange={(e) => {
                    choose(e.target.files);
                    // The same file can be chosen again after a failure.
                    e.target.value = '';
                  }}
                />
              </>
            ) : (
              <div className="ch-cl-paste">
                <textarea
                  className="ch-textarea"
                  rows={8}
                  aria-label="Paste your schedule"
                  aria-invalid={pasteEmpty || undefined}
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setPasteEmpty(false);
                  }}
                  // A table copied from a portal (columns separated by tabs) is the layout the reader gets right most often.
                  placeholder={'Course\tTitle\tDays\tTime\tLocation\nSTAT 201\tProbability and Statistics\tTTh\t9:00AM - 10:15AM\tHanes Hall 120'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {pasteEmpty && (
                  <span className="ch-field__help is-error" role="alert" data-ch-code="CH-12110">
                    Paste your schedule text first.
                  </span>
                )}
                <Button
                  variant="primary"
                  leftIcon={Sparkles}
                  onClick={() => {
                    if (!text.trim()) {
                      setPasteEmpty(true);
                      return;
                    }
                    void run({ kind: 'text', text });
                  }}
                >
                  Read schedule
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/**
 * The import's result: how many classes, whether they reached the calendar and until when, the classes that can't be on it (no days, or no
 * time) and why, and any that overlap the team this week. A class with nothing to put on the calendar is imported and saved all the same,
 * so the result says which ones aren't on it rather than "they're on your calendar".
 */
function ImportedView({ imported, syncState, term, week }: { imported: { classes: ChClass[]; skipped: string[] }; syncState: 'syncing' | 'failed' | 'ok'; term: ChTerm; week: ChWeek }) {
  const n = imported.classes.length;
  const skipped = imported.skipped.length;
  if (n === 0) {
    return (
      <EmptyState
        code="CH-12307"
        icon={Check}
        title="Already on your schedule"
        body={`${skipped === 1 ? 'That class is' : `Those ${skipped} classes are`} already on your schedule, so nothing was imported. Remove the existing ${skipped === 1 ? 'entry' : 'entries'} first to import again.`}
      />
    );
  }
  // This week's overlaps are for the classes in this term: one in next term doesn't meet over practice this week.
  const thisTerm = imported.classes.filter((c) => inTerm(c, term));
  const overlaps = week.error ? [] : groupConflicts(conflictsOf(thisTerm, week.events, week.dates), thisTerm);
  const off = imported.classes.filter((c) => calendarGap(c) != null);
  const onCalendar = imported.classes.filter((c) => calendarGap(c) == null);
  const on = onCalendar.length;
  // Each class repeats until the end of its own term; the classes of one import can be in more than one.
  const ends = [...new Set(onCalendar.map((c) => termEnd(c.semester, term)))].sort();
  const until = ends.length === 1 ? `until ${shortDay(ends[0]!)}` : `until the end of their terms, ${joinList(ends.map(shortDay))}`;
  const lead = on === n ? (n === 1 ? "It's" : "They're") : on === 1 ? `1 of ${n} is` : `${on} of ${n} are`;
  return (
    <div className="ch-cl-ok" role="status">
      <span className="ch-cl-ok__ic">
        <Icon icon={Check} size={28} />
      </span>
      <b>
        {n} {n === 1 ? 'class' : 'classes'} imported
      </b>
      <p>
        {syncState === 'syncing'
          ? 'Adding them to your calendar…'
          : syncState === 'failed'
            ? "Some didn't reach your calendar. Use Retry sync on the Classes page."
            : on > 0
              ? `${lead} on your calendar and ${on === 1 ? 'repeats' : 'repeat'} weekly ${until}.`
              : ''}
        {syncState !== 'syncing' && off.length > 0
          ? ` Not on your calendar: ${joinList(off.map((c) => `${c.code || c.name} (${gapReason(calendarGap(c)!)})`))}. Open the class to add what's missing.`
          : ''}
        {skipped > 0 ? ` ${skipped} already on your schedule and skipped.` : ''}
      </p>
      <div className="ch-cl-ok__chips">
        {imported.classes.map((c) => (
          <span key={c.id} className={`ch-cl-t-${c.tone}`}>
            {c.code || c.name}
          </span>
        ))}
      </div>
      {overlaps.length > 0 && (
        <div className="ch-cl-clash" data-ch-code="CH-12109">
          <Icon icon={TriangleAlert} size={15} />
          <span>
            <b>{overlaps.length === 1 ? '1 overlap with the team this week.' : `${overlaps.length} overlaps with the team this week.`}</b>
            {overlaps
              .slice(0, 2)
              .map((g) => `${g.classes.map((c) => c.code || c.name).join(' and ')} meets over ${g.event.title || 'a team event'}`)
              .join('; ')}
            .
          </span>
        </div>
      )}
    </div>
  );
}
