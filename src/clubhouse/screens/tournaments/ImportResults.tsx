'use client';

import { Check, ClipboardPaste, FileQuestion, FileWarning, FileX, ImageOff, SearchX, SlidersHorizontal, TriangleAlert, Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { importTournamentResults, type TourImportKept, type TourImportResult } from '@/app/golf/actions/tournaments-import';
import { haptic } from '../../lib/haptics';
import { plural, pluralWord } from '../../lib/plural';
import { useAction } from '../../lib/use-action';
import { useChPhone } from '../../lib/use-phone';
import { useRefresh } from '../../lib/use-refresh';
import { Button } from '../../ui/Button';
import { Checkbox } from '../../ui/Checkbox';
import { Icon } from '../../ui/Icon';
import { Modal } from '../../ui/Modal';
import { ScrollRegion } from '../../ui/ScrollRegion';
import { Segmented } from '../../ui/Segmented';
import { Select } from '../../ui/Select';
import { Spinner } from '../../ui/Spinner';
import { EmptyState } from '../../ui/States';
import {
  buildPlan,
  fileTeams,
  importInput,
  planCounts,
  withChoices,
  type ChImportInput,
  type ChImportPlan,
  type ChPlanContext,
  type ChPlanPlayer,
  type ChPlanRound,
  type ChPlanTeam,
} from './import/plan';
import { columnName, findLayouts, listOf, readResults, withColumn, withRun, type ChColumnKey, type ChResultsRead, type ChSheetLayout } from './import/results';
import { MAX_RESULTS_FILE_BYTES, readResultsBytes, readResultsText, type ChResultsSheet, type ChSheetsFail } from './import/sheets';
import { TourChip } from './parts';
import type { ChTourDeskData } from './types';
import '../../styles/tournaments-import.css';

type Step = 'pick' | 'reading' | 'error' | 'check' | 'done';
type Tab = 'file' | 'paste';

/** Delay then minimum (motion research #8): no reading state for a read quicker than this… */
const READ_DELAY_MS = 150;
/** …and once it shows, it stays at least this long, so it never flashes. */
const READ_MIN_MS = 450;

/** What the coach is told when a file can't be read (CH-16180), one line each, with the way forward. */
const FAIL: Record<ChSheetsFail, { icon: LucideIcon; title: string; body: string }> = {
  empty: {
    icon: FileQuestion,
    title: 'Nothing to read',
    body: 'The file is empty. Download the export again, or copy the results and paste them.',
  },
  binary_xls: {
    icon: FileWarning,
    title: 'This is the old Excel format',
    body: 'Open it in Excel or Numbers, save it as .xlsx or CSV, then choose it again.',
  },
  pdf: {
    icon: FileX,
    title: 'A PDF can’t be read here',
    body: 'Use the spreadsheet or CSV export of the same results, or copy the leaderboard from the results page and paste it.',
  },
  image: {
    icon: ImageOff,
    title: 'A picture can’t be read here',
    body: 'Use the spreadsheet or CSV export of the same results, or copy the leaderboard from the results page and paste it.',
  },
  unsupported: {
    icon: FileQuestion,
    title: 'We can’t read that file type',
    body: 'Use an .xlsx, .csv or .txt export, or paste the results.',
  },
  broken: {
    icon: FileWarning,
    title: 'This file didn’t open',
    body: 'It may be damaged or only partly downloaded. Download it again and choose it once more.',
  },
  too_large: {
    icon: FileWarning,
    title: 'That file is too large',
    body: `Use a file under ${MAX_RESULTS_FILE_BYTES / 1024 / 1024} MB. A results export is usually well under 1 MB.`,
  },
};

const KEPT_WORDS: Record<TourImportKept, string> = {
  submitted: 'a submitted round, kept as it is',
  entered: 'a score entered by hand, kept',
  card: 'linked to a card, kept',
  not_in_lineup: 'not in that round’s lineup',
  failed: 'didn’t save; import the file again to try it once more',
};

/**
 * Import results (launch readiness F-01) on the Event desk: a results export (Golf Genius’s hole-by-hole sheet first,
 * any hole-by-hole or round-by-round spreadsheet, CSV or copied leaderboard) is read here on the device, matched to the
 * roster and checked, then saved in one go. Our players’ holes go onto their tournament cards and other teams’ scores
 * onto the field. Nothing is saved until the coach presses Save, a submitted round is never changed (D-82), and where
 * the file and a card disagree both are shown and the coach chooses.
 */
export function ImportResults({ open, onClose, data }: { open: boolean; onClose: () => void; data: ChTourDeskData }) {
  const e = data.event;
  const phone = useChPhone();
  const ctx = useMemo<ChPlanContext>(
    () => ({
      event: e,
      players: data.players,
      ledger: data.holes,
      courses: data.courses,
      teamName: data.teamName ?? null,
    }),
    [e, data.players, data.holes, data.courses, data.teamName],
  );
  const { refresh } = useRefresh();

  const [was, setWas] = useState(false);
  const [step, setStep] = useState<Step>('pick');
  const [tab, setTab] = useState<Tab>('file');
  const [text, setText] = useState('');
  const [pasteEmpty, setPasteEmpty] = useState(false);
  const [over, setOver] = useState(false);
  const [readingShown, setReadingShown] = useState(false);
  const [fail, setFail] = useState<ChSheetsFail | null>(null);
  const [source, setSource] = useState<{
    name: string;
    sheets: ChResultsSheet[];
  } | null>(null);
  const [layouts, setLayouts] = useState<ChSheetLayout[]>([]);
  const [picks, setPicks] = useState<Record<string, string | null>>({});
  const [pickRound, setPickRound] = useState<number | null>(null);
  const [team, setTeam] = useState<string | null | undefined>(undefined);
  const [uses, setUses] = useState<Record<string, 'file' | 'card'>>({});
  const [drop, setDrop] = useState<ReadonlySet<string>>(new Set());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [edited, setEdited] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [saved, setSaved] = useState<TourImportResult | null>(null);
  const token = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Each time the sheet opens it starts at the beginning.
  if (open !== was) {
    setWas(open);
    if (open) {
      setStep('pick');
      setTab('file');
      setText('');
      setPasteEmpty(false);
      setFail(null);
      setSource(null);
      setRestarting(false);
      setSaved(null);
    }
  }

  const read: ChResultsRead | null = useMemo(() => (source ? readResults(source.sheets, layouts) : null), [source, layouts]);
  const plan: ChImportPlan | null = useMemo(
    () =>
      read
        ? withChoices(
            buildPlan(read, ctx, {
              pickRound,
              picks,
              ...(team !== undefined ? { team } : {}),
            }),
            uses,
            drop,
          )
        : null,
    [read, ctx, pickRound, picks, team, uses, drop],
  );
  const input: ChImportInput | null = useMemo(() => (plan ? importInput(plan, ctx) : null), [plan, ctx]);

  const save = useAction('tournaments.importResults', importTournamentResults, {
    // The sheet's own result view is the confirmation: the save ticks (success haptic) and says the rest there.
    done: '',
    failed: 'Couldn’t save the results',
    hint: 'Nothing new was lost. Try again; rounds already saved are left as they are.',
    code: 'CH-16080',
  });

  const close = () => {
    // A read still running is left to finish unheard.
    token.current += 1;
    onClose();
  };

  const begin = (next: { name: string; sheets: ChResultsSheet[] }) => {
    const found = findLayouts(next.sheets);
    setSource(next);
    setLayouts(found);
    setPicks({});
    setPickRound(null);
    setTeam(undefined);
    setUses({});
    setDrop(new Set());
    setEdited(false);
    // A file with no columns read as scores opens on the column editor (CH-16181).
    setColumnsOpen(found.every((l) => l.kind === 'none'));
    setStep('check');
  };

  const run = async (get: () => Promise<ReturnType<typeof readResultsBytes>>, name: string) => {
    const mine = ++token.current;
    setStep('reading');
    setReadingShown(false);
    let shownAt = 0;
    const appear = window.setTimeout(() => {
      if (token.current !== mine) return;
      shownAt = Date.now();
      setReadingShown(true);
    }, READ_DELAY_MS);
    let result: ReturnType<typeof readResultsBytes>;
    try {
      // A beat for the step to paint before a large workbook is unzipped on this thread.
      await new Promise((r) => window.setTimeout(r, 0));
      result = await get();
    } catch {
      result = { ok: false, reason: 'broken' };
    }
    window.clearTimeout(appear);
    if (token.current !== mine) return;
    const held = shownAt ? READ_MIN_MS - (Date.now() - shownAt) : 0;
    if (held > 0) await new Promise((r) => window.setTimeout(r, held));
    if (token.current !== mine) return;
    if (!result.ok) {
      haptic('error');
      setFail(result.reason);
      setStep('error');
      return;
    }
    begin({ name, sheets: result.sheets });
  };

  const chooseFile = (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    if (f.size > MAX_RESULTS_FILE_BYTES) {
      haptic('error');
      setFail('too_large');
      setStep('error');
      return;
    }
    void run(async () => readResultsBytes(new Uint8Array(await f.arrayBuffer()), f.name.replace(/\.[^.]+$/, '')), f.name);
  };
  const drop_ = (ev: DragEvent) => {
    ev.preventDefault();
    setOver(false);
    chooseFile(ev.dataTransfer.files);
  };
  const readPaste = () => {
    if (!text.trim()) {
      setPasteEmpty(true);
      return;
    }
    void run(async () => readResultsText(text), 'Pasted results');
  };

  const startOver = () => {
    setRestarting(false);
    setSource(null);
    setStep('pick');
  };
  const doSave = async () => {
    if (!input) return;
    const r = await save.run(input);
    if (r.success && r.data) {
      setSaved(r.data);
      setStep('done');
      refresh();
    }
  };

  const counts = plan ? planCounts(plan) : null;
  const rounds = input?.cards.length ?? 0;
  const teamsToSave = input?.teams.filter((t) => !t.us).length ?? 0;
  const placesOnly = !!input && rounds === 0 && teamsToSave === 0 && input.teams.length > 0;
  const saveLabel = save.pending
    ? 'Saving…'
    : rounds && teamsToSave
      ? `Save ${plural(rounds, 'round')} and ${plural(teamsToSave, 'team')}`
      : rounds
        ? `Save ${plural(rounds, 'round')}`
        : teamsToSave
          ? `Save ${plural(teamsToSave, 'team')}`
          : placesOnly
            ? 'Save places'
            : 'Nothing to save';
  const nothing = !rounds && !teamsToSave && !placesOnly;
  // Choices made on the check step are work: Start over asks before letting them go (CH-16580).
  const worked = Object.keys(picks).length + Object.keys(uses).length + drop.size > 0 || pickRound != null || team !== undefined || edited;

  const title = step === 'done' ? 'Results saved' : step === 'check' ? 'Check the results' : 'Import results';
  const description =
    step === 'done'
      ? e.name
      : step === 'check'
        ? 'Nothing is saved until you press Save'
        : 'A Golf Genius export, any results spreadsheet or CSV, or a copied leaderboard';

  return (
    <>
      {/* The sheet steps aside while Start over is asked (one dialog at a time), and comes back as it was. */}
      <Modal
        open={open && !restarting}
        onClose={close}
        title={title}
        description={description}
        width={step === 'check' ? 760 : 600}
        className="ch-tour-imp-modal"
        footer={
          step === 'done' ? (
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          ) : step === 'check' ? (
            <>
              <Button variant="ghost" feel={worked ? 'warning' : null} onClick={() => (worked ? setRestarting(true) : startOver())}>
                Start over
              </Button>
              <Button variant="primary" leftIcon={Check} busy={save.pending} disabled={nothing} onClick={() => void doSave()}>
                {saveLabel}
              </Button>
            </>
          ) : undefined
        }
      >
        <div className="ch-tour-imp">
          {step === 'done' && saved ? (
            <Saved result={saved} data={data} />
          ) : step === 'reading' && !readingShown ? (
            <div className="ch-tour-imp-read is-wait" role="status" aria-label="Reading the results" />
          ) : step === 'reading' ? (
            <div className="ch-tour-imp-read" role="status" data-ch-code="CH-16480">
              <Spinner size="lg" />
              <b>Reading the results…</b>
              <span>Finding players, rounds and holes</span>
            </div>
          ) : step === 'error' && fail ? (
            <div className="ch-tour-imp-err" role="alert" data-ch-code="CH-16180" data-ch-fail={fail}>
              <span className="ch-tour-imp-err__ic">
                <Icon icon={FAIL[fail].icon} size={22} />
              </span>
              <b>{FAIL[fail].title}</b>
              <p>{FAIL[fail].body}</p>
              <div className="ch-tour-imp-err__a">
                <Button
                  variant="primary"
                  onClick={() => {
                    setTab('file');
                    setStep('pick');
                  }}
                >
                  Choose another file
                </Button>
                <Button
                  variant="ghost"
                  leftIcon={ClipboardPaste}
                  onClick={() => {
                    setTab('paste');
                    setStep('pick');
                  }}
                >
                  Paste instead
                </Button>
              </div>
            </div>
          ) : step === 'check' && source && read && plan ? (
            <CheckView
              data={data}
              source={source}
              layouts={layouts}
              onLayouts={(l) => {
                setLayouts(l);
                setEdited(true);
              }}
              read={read}
              plan={plan}
              counts={counts!}
              columnsOpen={columnsOpen}
              onColumns={setColumnsOpen}
              onPickRound={setPickRound}
              onTeam={setTeam}
              onPick={(key, id) => setPicks((p) => ({ ...p, [key]: id }))}
              onUse={(key, use) => setUses((u) => ({ ...u, [key]: use }))}
              onKeep={(key, keep) =>
                setDrop((d) => {
                  const next = new Set(d);
                  if (keep) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
            />
          ) : (
            <>
              <Segmented
                label="How to add the results"
                value={tab}
                onChange={(t) => {
                  setTab(t);
                  setPasteEmpty(false);
                }}
                options={[
                  { value: 'file', label: 'File' },
                  { value: 'paste', label: 'Paste' },
                ]}
              />
              {tab === 'file' ? (
                <>
                  {/* The drop zone is a real button, so the keyboard opens the file picker too. */}
                  <button
                    type="button"
                    className={'ch-tour-imp-drop' + (over ? ' is-over' : '')}
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(ev) => {
                      ev.preventDefault();
                      setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={drop_}
                  >
                    <span className="ch-tour-imp-drop__ic" aria-hidden="true">
                      <Icon icon={Upload} size={20} />
                    </span>
                    {/* A phone has nothing to drag a file from: it only chooses one. */}
                    <b>{phone ? 'Choose the results file' : 'Drop the results file here'}</b>
                    <em>
                      {phone ? '' : 'or choose a file · '}.xlsx, .csv or .txt · up to {MAX_RESULTS_FILE_BYTES / 1024 / 1024} MB
                    </em>
                    <span className="ch-tour-imp-drop__tip">Hole-by-hole exports fill in each player’s card. Leaderboards with round scores work too.</span>
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    hidden
                    aria-label="Choose a results file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt,.htm,.html,text/csv,text/plain,text/html,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    onChange={(ev) => {
                      chooseFile(ev.target.files);
                      // The same file can be chosen again after a failure.
                      ev.target.value = '';
                    }}
                  />
                </>
              ) : (
                <div className="ch-tour-imp-paste">
                  <textarea
                    className="ch-textarea"
                    rows={8}
                    aria-label="Paste the results"
                    aria-invalid={pasteEmpty || undefined}
                    aria-describedby={pasteEmpty ? 'ch-tour-imp-paste-err' : undefined}
                    value={text}
                    onChange={(ev) => {
                      setText(ev.target.value);
                      setPasteEmpty(false);
                    }}
                    // A table copied from a results page or a spreadsheet arrives with tabs between its columns.
                    placeholder={'Pos\tPlayer\tTeam\tR1\tR2\tTotal\nT1\tAva Lindqvist\tDemo University\t70\t71\t141'}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  {pasteEmpty && (
                    <span id="ch-tour-imp-paste-err" className="ch-field__help is-error" role="alert" data-ch-code="CH-16183">
                      Paste the results first.
                    </span>
                  )}
                  <Button variant="primary" onClick={readPaste}>
                    Read results
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Modal>
      <Modal
        open={open && restarting}
        onClose={() => setRestarting(false)}
        icon={TriangleAlert}
        code="CH-16580"
        title="Start over?"
        description="The choices you made on this file are let go, and nothing is saved."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRestarting(false)}>
              Keep checking
            </Button>
            {/* The warning came with the question (D-70): the yes is silent, and the result answers. */}
            <Button variant="danger" feel={null} onClick={startOver}>
              Start over
            </Button>
          </>
        }
      />
    </>
  );
}

// ── The check step ─────────────────────────────────────────────────────────────────────────────────────────────

function CheckView({
  data,
  source,
  layouts,
  onLayouts,
  read,
  plan,
  counts,
  columnsOpen,
  onColumns,
  onPickRound,
  onTeam,
  onPick,
  onUse,
  onKeep,
}: {
  data: ChTourDeskData;
  source: { name: string; sheets: ChResultsSheet[] };
  layouts: ChSheetLayout[];
  onLayouts: (l: ChSheetLayout[]) => void;
  read: ChResultsRead;
  plan: ChImportPlan;
  counts: ReturnType<typeof planCounts>;
  columnsOpen: boolean;
  onColumns: (open: boolean) => void;
  onPickRound: (n: number) => void;
  onTeam: (key: string) => void;
  onPick: (key: string, id: string | null) => void;
  onUse: (key: string, use: 'file' | 'card') => void;
  onKeep: (key: string, keep: boolean) => void;
}) {
  const e = data.event;
  const empty = read.players.length === 0 && read.teams.length === 0;
  const teams = fileTeams(read);
  const us = plan.teams.find((t) => t.us);
  const others = plan.teams.filter((t) => !t.us);
  const read_ = layouts.filter((l) => l.kind !== 'none');
  // What was read, in the coach's words: "Hole by hole · 61 players · 12 teams"; a workbook names the sheets it used.
  const shapes = [...new Set(read_.map((l) => SHAPE_WORDS[l.kind]))].filter(Boolean);
  const teamsRead = new Set([...read.teams.map((t) => t.key), ...read.players.map((p) => p.team ?? '').filter(Boolean)]).size;
  const sheetLine = read_.length
    ? [
        source.sheets.length > 1 ? `${listOf(read_.map((l) => source.sheets[l.sheet]?.name ?? 'Sheet'))} of ${plural(source.sheets.length, 'sheet')}` : null,
        shapes.length === 1 ? shapes[0] : null,
        read.players.length ? plural(read.players.length, 'player') : null,
        teamsRead ? plural(teamsRead, 'team') : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : 'Nothing read yet';

  return (
    <>
      <div className="ch-tour-imp-src">
        <p>
          <b>{source.name}</b>
          <span>{sheetLine}</span>
        </p>
        <Button
          size="sm"
          variant="ghost"
          leftIcon={SlidersHorizontal}
          aria={{ expanded: columnsOpen, controls: 'ch-tour-imp-cols' }}
          onClick={() => onColumns(!columnsOpen)}
        >
          Columns
        </Button>
      </div>

      {columnsOpen && <ColumnEditor id="ch-tour-imp-cols" source={source} layouts={layouts} onLayouts={onLayouts} event={data.event} />}

      {empty ? (
        <EmptyState
          compact
          kind="first-run"
          icon={SearchX}
          code="CH-16181"
          title="No scores found"
          body="The file opened, but no column reads as players with scores. Set the columns above: the player names, then the holes or the round scores."
        />
      ) : (
        <>
          <dl className="ch-tour-imp-sum">
            <div>
              <dt>Rounds to save</dt>
              <dd className="ch-num">{counts.cards}</dd>
            </div>
            <div>
              <dt>Already in</dt>
              <dd className="ch-num">{counts.same}</dd>
            </div>
            <div className={counts.differs ? 'is-warn' : undefined}>
              <dt>Differ</dt>
              <dd className="ch-num">{counts.differs}</dd>
            </div>
            <div>
              <dt>Teams</dt>
              <dd className="ch-num">{counts.teams}</dd>
            </div>
          </dl>

          {(plan.pickRound != null || teams.length > 1) && (
            <div className="ch-tour-imp-ask">
              {plan.pickRound != null && (
                <ImpField className="ch-tour-imp-ask__f" label="These holes are for">
                  {(id) => (
                    <Select
                      id={id}
                      value={String(plan.pickRound)}
                      options={e.rounds.map((r) => ({
                        value: String(r.number),
                        label: `Round ${r.number}`,
                      }))}
                      onChange={(v) => {
                        haptic('select');
                        onPickRound(Number(v));
                      }}
                    />
                  )}
                </ImpField>
              )}
              {teams.length > 1 && (
                <ImpField className="ch-tour-imp-ask__f" label="Your team in this file">
                  {(id) => (
                    <Select
                      id={id}
                      value={us?.key ?? ''}
                      options={[...(us ? [] : [{ value: '', label: 'Choose a team' }]), ...teams.map((t) => ({ value: t.key, label: t.name }))]}
                      onChange={(v) => {
                        if (!v) return;
                        haptic('select');
                        onTeam(v);
                      }}
                    />
                  )}
                </ImpField>
              )}
            </div>
          )}

          {plan.warnings.length > 0 && (
            <div className="ch-tour-imp-warn" role="status">
              <Icon icon={TriangleAlert} size={15} />
              <span>
                <b>Worth a look</b>
                {plan.warnings.join(' ')}
              </span>
            </div>
          )}

          <section className="ch-tour-imp-sec" aria-labelledby="ch-tour-imp-players">
            <h3 id="ch-tour-imp-players">Your players</h3>
            {plan.players.length === 0 ? (
              <EmptyState
                compact
                kind="first-run"
                code="CH-16380"
                title={read.players.length ? 'None of your players are in this file' : 'No player rows in this file'}
                body={
                  read.players.length
                    ? `The file’s players are on ${listOf(teams.map((t) => t.name))}. Choose your team above if it is there under another name.`
                    : 'It has team scores only, so your players’ rounds stay as they are. Team scores and places can still be saved.'
                }
              />
            ) : (
              <ul className="ch-tour-imp-ps">
                {plan.players.map((p) => (
                  <PlayerRow key={p.key} p={p} data={data} onPick={onPick} onUse={onUse} />
                ))}
              </ul>
            )}
          </section>

          {plan.teams.length > 0 && (
            <section className="ch-tour-imp-sec" aria-labelledby="ch-tour-imp-teams">
              <h3 id="ch-tour-imp-teams">The field</h3>
              <ul className="ch-tour-imp-ts">
                <TeamHead event={data.event} />
                {us && <TeamRow t={us} event={data.event} />}
                {others.map((t) => (
                  <TeamRow key={t.key} t={t} event={data.event} onKeep={(keep) => onKeep(t.key, keep)} />
                ))}
              </ul>
              <p className="ch-tour-imp-note">
                {plan.places === 'file'
                  ? 'Places come from the file.'
                  : plan.places === 'ladder'
                    ? 'Places are worked out from every team’s players, ties broken by the NCAA rule: the lower non-counting scores, then each round’s counting scores in turn.'
                    : plan.teams.length > 1 && !plan.teams.every((t) => t.rounds.every((v) => v != null))
                      ? 'Places aren’t set from this file, because not every team has a score for every round.'
                      : 'Places aren’t set from this file.'}
                {us ? ' Your team’s scores always come from your players’ cards.' : ''}
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}

const ACTION_WORD: Record<ChPlanRound['action'], string> = {
  new: 'New',
  same: 'Already in',
  update: 'Fills in',
  differs: 'Differs',
  skip: 'Not saved',
};
const SKIP_WORD = {
  not_playing: 'Not in the lineup',
  no_round: 'No such round',
  no_score: 'No score',
} as const;

function roundTotal(r: ChPlanRound): string {
  if (r.status === 'wd') return 'WD';
  if (r.status === 'dq') return 'DQ';
  return r.total == null ? (r.holes ? `${r.holes.filter((h) => h != null).length} holes` : '—') : String(r.total);
}

function PlayerRow({
  p,
  data,
  onPick,
  onUse,
}: {
  p: ChPlanPlayer;
  data: ChTourDeskData;
  onPick: (key: string, id: string | null) => void;
  onUse: (key: string, use: 'file' | 'card') => void;
}) {
  const roster = data.players.filter((x) => !x.alumni || x.id === p.playerId);
  const order = [...p.candidates.filter((id) => roster.some((x) => x.id === id)), ...roster.map((x) => x.id).filter((id) => !p.candidates.includes(id))];
  const who = data.players.find((x) => x.id === p.playerId);
  const differs = p.rounds.filter((r) => r.action === 'differs');
  return (
    <li className={'ch-tour-imp-p' + (p.playerId ? '' : ' is-off')} data-ch-import-player={p.key}>
      <div className="ch-tour-imp-p__h">
        <span className="ch-tour-imp-p__n">
          <b>{p.fileName}</b>
        </span>
        <span className="ch-tour-imp-p__m">
          {p.how === 'close' && <TourChip tone="warn">Close match</TourChip>}
          <Select
            label={`Roster match for ${p.fileName}`}
            value={p.playerId ?? ''}
            options={[
              { value: '', label: 'Not on our roster' },
              ...order.map((id) => ({
                value: id,
                label: data.players.find((x) => x.id === id)?.name ?? 'Player',
              })),
            ]}
            onChange={(v) => {
              haptic('select');
              onPick(p.key, v || null);
            }}
          />
        </span>
      </div>
      <ul className="ch-tour-imp-p__r" aria-label={`${p.fileName}’s rounds`}>
        {p.rounds.map((r) => {
          const word = !p.playerId
            ? 'Not saved'
            : r.action === 'skip'
              ? r.skip
                ? SKIP_WORD[r.skip]
                : 'Not saved'
              : r.action === 'differs'
                ? r.use === 'card'
                  ? 'Keeps the card'
                  : 'Uses the file'
                : ACTION_WORD[r.action];
          const tone = !p.playerId || r.action === 'skip' || r.action === 'same' ? undefined : r.action === 'differs' ? 'warn' : 'ok';
          return (
            <li key={r.roundNumber}>
              <TourChip tone={tone}>
                <span>R{r.roundNumber}</span>
                <b className="ch-num">{roundTotal(r)}</b>
                <span>{word}</span>
              </TourChip>
            </li>
          );
        })}
      </ul>
      {p.playerId &&
        differs.map((r) => {
          const first = who?.first ?? 'The player';
          const submitted = r.card?.kind === 'submitted';
          const holesLine = r.differsOn.length ? ` Holes ${listOf(r.differsOn.map(String), 6)} differ.` : '';
          return (
            <div key={r.roundNumber} className="ch-tour-imp-dif" data-ch-code="CH-16980">
              <p>
                Round {r.roundNumber}: the file says <b className="ch-num">{roundTotal(r)}</b>,{' '}
                {submitted ? `${first}’s submitted round says` : 'the card says'} <b className="ch-num">{r.card?.total ?? '—'}</b>.{holesLine}
                {submitted && r.use === 'file' ? ` The file’s score is entered as the official one; the round stays on ${first}’s Rounds page.` : ''}
              </p>
              <Segmented
                size="sm"
                label={`Round ${r.roundNumber} for ${p.fileName}`}
                value={r.use}
                onChange={(v) => onUse(`${p.key}:${r.roundNumber}`, v)}
                options={[
                  {
                    value: 'card',
                    label: submitted ? 'Keep the round' : 'Keep the card',
                  },
                  { value: 'file', label: 'Use the file' },
                ]}
              />
            </div>
          );
        })}
    </li>
  );
}

/** The field's column heads, for sight only: each row says its own figures to a screen reader. */
function TeamHead({ event }: { event: ChTourDeskData['event'] }) {
  return (
    <li className="ch-tour-imp-t ch-tour-imp-t--head" aria-hidden="true">
      <span className="ch-tour-imp-t__n">Team</span>
      <span className="ch-tour-imp-t__r">
        {event.rounds.map((r) => (
          <i key={r.number}>R{r.number}</i>
        ))}
      </span>
      <span className="ch-tour-imp-t__tot">Total</span>
      <span className="ch-tour-imp-t__pl">Place</span>
      <span />
    </li>
  );
}

function TeamRow({ t, event, onKeep }: { t: ChPlanTeam; event: ChTourDeskData['event']; onKeep?: (keep: boolean) => void }) {
  const place = t.place ? `${t.place.tied ? 'T' : ''}${t.place.n}` : null;
  return (
    <li className={'ch-tour-imp-t' + (t.us ? ' is-us' : '') + (t.keep ? '' : ' is-off')}>
      <span className="ch-tour-imp-t__n">
        <b>{t.name}</b>
        {t.us ? <TourChip>Your team</TourChip> : !t.fieldTeamId ? <TourChip tone="ok">New to the field</TourChip> : null}
        {t.bTeam && <TourChip>B team</TourChip>}
      </span>
      <span
        className="ch-tour-imp-t__r ch-num"
        role="img"
        aria-label={`Round scores: ${t.rounds.map((v, i) => `round ${event.rounds[i]?.number ?? i + 1} ${v ?? 'none'}`).join(', ')}`}
      >
        {t.rounds.map((v, i) => (
          <i key={i}>{v ?? '—'}</i>
        ))}
      </span>
      <b className="ch-tour-imp-t__tot ch-num">
        <Spoken value={t.total} said={(v) => `Total ${v}`} none="No total" />
      </b>
      <span className="ch-tour-imp-t__pl ch-num">
        <Spoken value={place} said={() => `Place ${t.place?.tied ? 'tied ' : ''}${t.place?.n}`} none="No place" />
      </span>
      {onKeep ? (
        <Checkbox checked={t.keep} onChange={onKeep}>
          <span className="ch-sr-only">Save {t.name}</span>
          <span aria-hidden="true">Save</span>
        </Checkbox>
      ) : (
        <span className="ch-tour-imp-t__x" />
      )}
    </li>
  );
}

// ── The column editor ──────────────────────────────────────────────────────────────────────────────────────────

const KEY_FIELDS: ReadonlyArray<{ key: ChColumnKey; label: string }> = [
  { key: 'name', label: 'Player' },
  { key: 'team', label: 'Team' },
  { key: 'round', label: 'Round number' },
  { key: 'total', label: 'Total' },
];

/**
 * Where each value is in the file, per sheet, for when the reader guessed wrong or found nothing: the player column,
 * the team, the round number and total, the first hole of each nine and the first round score (the rest of a run
 * follows it). A peek at the sheet's first rows shows the coach which column is which.
 */
function ColumnEditor({
  id,
  source,
  layouts,
  onLayouts,
  event,
}: {
  id: string;
  source: { sheets: ChResultsSheet[] };
  layouts: ChSheetLayout[];
  onLayouts: (l: ChSheetLayout[]) => void;
  event: ChTourDeskData['event'];
}) {
  const [sheet, setSheet] = useState(0);
  const layout = layouts[sheet];
  const rows = source.sheets[sheet]?.rows ?? [];
  if (!layout) return null;
  const header = rows[layout.header] ?? [];
  const width = Math.max(header.length, ...rows.slice(layout.header, layout.header + 3).map((r) => r.length));
  const options = [
    { value: '', label: 'None' },
    ...Array.from({ length: width }, (_, c) => ({
      value: String(c),
      label: `${columnName(c)} · ${header[c]?.trim() || 'no heading'}`,
    })),
  ];
  const set = (next: ChSheetLayout) => onLayouts(layouts.map((l, i) => (i === sheet ? next : l)));
  const cols = layout.columns;
  const role = (c: number): string | null => {
    for (const f of KEY_FIELDS) if (cols[f.key] === c) return f.label;
    const h = cols.holes.indexOf(c);
    if (h >= 0) return `Hole ${h + 1}`;
    const r = cols.rounds.indexOf(c);
    return r >= 0 ? `Round ${r + 1}` : null;
  };
  const holes = event.format.holes;
  return (
    <div id={id} className="ch-tour-imp-cols">
      {layouts.length > 1 && (
        <Select
          label="Sheet"
          value={String(sheet)}
          options={layouts.map((l, i) => ({
            value: String(i),
            label: source.sheets[l.sheet]?.name ?? `Sheet ${i + 1}`,
          }))}
          onChange={(v) => setSheet(Number(v))}
        />
      )}
      <ScrollRegion className="ch-tour-imp-peek" label="The sheet’s first rows" fade={false}>
        <table className="ch-num">
          <thead>
            <tr>
              {Array.from({ length: width }, (_, c) => (
                <th key={c} scope="col" className={role(c) ? 'is-mapped' : undefined}>
                  <span>{columnName(c)}</span>
                  {role(c) && <em>{role(c)}</em>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(layout.header, layout.header + 3).map((r, i) => (
              <tr key={i} className={i === 0 ? 'is-head' : undefined}>
                {Array.from({ length: width }, (_, c) => (
                  <td key={c}>{r[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <div className="ch-tour-imp-cols__g">
        {KEY_FIELDS.map((f) => (
          <ImpField key={f.key} label={f.label}>
            {(id) => (
              <Select
                id={id}
                label={`${f.label} column`}
                value={cols[f.key] == null ? '' : String(cols[f.key])}
                options={options}
                onChange={(v) => set(withColumn(layout, f.key, v === '' ? null : Number(v)))}
              />
            )}
          </ImpField>
        ))}
        <ImpField label="Hole 1">
          {(id) => (
            <Select
              id={id}
              label="Hole 1 column"
              value={cols.holes[0] == null ? '' : String(cols.holes[0])}
              options={options}
              onChange={(v) => set(withRun(layout, 'hole', 1, v === '' ? null : Number(v), 9))}
            />
          )}
        </ImpField>
        {holes === 18 && (
          <ImpField label="Hole 10">
            {(id) => (
              <Select
                id={id}
                label="Hole 10 column"
                value={cols.holes[9] == null ? '' : String(cols.holes[9])}
                options={options}
                onChange={(v) => set(withRun(layout, 'hole', 10, v === '' ? null : Number(v), 9))}
              />
            )}
          </ImpField>
        )}
        <ImpField label="Round 1 score">
          {(id) => (
            <Select
              id={id}
              label="Round 1 score column"
              value={cols.rounds[0] == null ? '' : String(cols.rounds[0])}
              options={options}
              onChange={(v) => set(withRun(layout, 'round', 1, v === '' ? null : Number(v), Math.max(1, event.rounds.length)))}
            />
          )}
        </ImpField>
      </div>
      <p className="ch-tour-imp-note">Each nine’s holes and the round scores follow on from the first column you pick.</p>
    </div>
  );
}

const SHAPE_WORDS: Record<ChSheetLayout['kind'], string> = { holes: 'Hole by hole', rounds: 'Round scores', teams: 'Team scores', none: '' };

/** A figure as drawn, said in words: "Total 287", or "No total" for the dash. */
function Spoken<T extends string | number>({ value, said, none }: { value: T | null; said: (v: T) => string; none: string }) {
  if (value == null)
    return (
      <>
        <span className="ch-sr-only">{none}</span>
        <span aria-hidden="true">—</span>
      </>
    );
  return (
    <>
      <span className="ch-sr-only">{said(value)}</span>
      <span aria-hidden="true">{value}</span>
    </>
  );
}

/** A visible label tied to its control by id (the control keeps a fuller accessible name where it passes one). */
export function ImpField({ label, className, children }: { label: string; className?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

// ── Saved ──────────────────────────────────────────────────────────────────────────────────────────────────────

function Saved({ result, data }: { result: TourImportResult; data: ChTourDeskData }) {
  const e = data.event;
  const nameOf = (id: string) => data.players.find((p) => p.id === id)?.first ?? 'A player';
  const roundOf = (id: string) => e.rounds.find((r) => r.roundEventId === id)?.number ?? null;
  const lines = [
    result.cards ? `${plural(result.cards, 'round')} saved to your players’ cards.` : null,
    result.teams ? `${plural(result.teams, 'team')} on the field${result.added ? `, ${result.added} of them new` : ''}.` : null,
    result.places ? 'Places are set.' : null,
  ].filter(Boolean);
  return (
    <div className="ch-tour-imp-ok" role="status">
      <span className="ch-tour-imp-ok__ic">
        <Icon icon={Check} size={26} />
      </span>
      <b>{lines.length ? 'Saved' : 'Nothing changed'}</b>
      <p>{lines.length ? lines.join(' ') : 'Everything in the file was already in.'}</p>
      {result.kept.length > 0 && (
        <div className="ch-tour-imp-kept">
          <b>{`${plural(result.kept.length, 'round')} left as ${pluralWord(result.kept.length, 'it was', 'they were')}`}</b>
          <ul>
            {result.kept.map((k) => (
              <li key={`${k.playerId}-${k.roundEventId}`}>
                {nameOf(k.playerId)}, round {roundOf(k.roundEventId) ?? '—'}: {KEPT_WORDS[k.why]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
