'use client';

import { Button } from '../../../../ui/Button';

import { Camera, Check, ChevronLeft, CircleCheck, Clock, FileText, Image as ImageIcon, Users } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';
import { readPlanFormat, setPlanFormat, undoPlanFormat, type FormatSections, type PriorFormat } from '@/app/golf/actions/coachhelm-plan-format';
import { createGolfDocument, deleteGolfDocument, uploadGolfDocument } from '@/app/golf/actions/documents';
import { FormSheet } from '../../../../ui/FormSheet';
import { Icon } from '../../../../ui/Icon';
import { useChPhone } from '../../../../lib/use-phone';
import { PhoneTop } from '../../../../shell/phone-chrome';
import { plural } from '../../../../lib/plural';
import { useUndoWindow } from '../useUndoWindow';

export type FormatView =
  | { k: 'empty' }
  | { k: 'reading'; file: string; meta: string }
  | { k: 'found'; file: string; documentId: string; sections: FormatSections }
  | { k: 'set'; file: string; id: string; until: string; prior?: PriorFormat | null }
  | { k: 'failed'; message: string };

const LINE: Record<FormatSections[number]['key'], string> = {
  header: 'Team, date, time and place',
  groups: 'At the top, one column each',
  schedule: 'Time, station, and where each group is',
  bring: 'A checklist',
  notes: 'Lines to write on',
};

/** The sample sheet, drawn: a shape of the file, never its contents. */
function Sample({ found }: { found?: boolean }) {
  return (
    <div className="smpw">
      <div className={'smp' + (found ? ' found' : '')} aria-hidden="true">
        <div className="sh1">
          <i />
          <i />
          {found && <em className="tagr">Header</em>}
        </div>
        <i className="sh2" />
        <div className="sbx">
          <span />
          <span />
          <span />
          {found && <em className="tagr">Groups</em>}
        </div>
        <div className="stb">
          {Array.from({ length: 8 }, (_, r) => (
            <div key={r}>
              {Array.from({ length: 5 }, (_, c) => (
                <i key={c} />
              ))}
            </div>
          ))}
          {found && <em className="tagr">Schedule</em>}
        </div>
      </div>
      {!found && <span className="scanl" aria-hidden="true" />}
    </div>
  );
}

/** Practice › Plan format (S-FMT.*): one upload sets the layout new plans use. Layout only: a drill, a time or a name in the sample never carries over. */
export function PlanFormat({ teamId = '', initial = { k: 'empty' }, current = 'GolfHelm standard', published = 0, sheet: startSheet = false, picked: startPicked = null, preview = false, see = null }: { see?: { label: string; href: string } | null; teamId?: string; initial?: FormatView; current?: string; published?: number; sheet?: boolean; picked?: { name: string; meta: string } | null; preview?: boolean }) {
  const [view, setView] = useState<FormatView>(initial);
  const [sheet, setSheet] = useState(startSheet);
  const [picked] = useState(startPicked);
  const [name, setName] = useState(current);
  // Undo puts back the name the page had: the file just undone isn't the current format.
  const before = useRef(current);
  const lastSample = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const phone = useChPhone();
  const router = useRouter();
  const undoOpen = useUndoWindow(view.k === 'set' ? view.until : null);
  const pick = async (file: File) => {
    setSheet(false);
    setView({ k: 'reading', file: file.name, meta: `${file.type.includes('pdf') ? 'PDF' : 'File'} · 1 page` });
    const up = await uploadGolfDocument(file, teamId);
    if (!up.success || !up.file_url) return setView({ k: 'failed', message: 'That file didn’t upload. Try again.' });
    const doc = (await createGolfDocument({ team_id: teamId, title: file.name, file_url: up.file_url, file_type: file.type, file_size: file.size, player_visible: false, folder: 'Plan formats' })) as { data?: { id?: string } | null };
    const documentId = doc.data?.id;
    if (!documentId) return setView({ k: 'failed', message: 'That file didn’t upload. Try again.' });
    // Try another: the last sample goes, so a coach's Documents doesn't fill with retries.
    if (lastSample.current) void deleteGolfDocument(lastSample.current).catch(() => {});
    lastSample.current = documentId;
    const res = await readPlanFormat(documentId);
    if (!res.success) return setView({ k: 'failed', message: res.error });
    setView({ k: 'found', file: file.name, documentId, sections: res.sections });
  };
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void pick(f);
    e.target.value = '';
  };
  const use = async () => {
    if (view.k !== 'found') return;
    const until = new Date(Date.now() + 8000).toISOString();
    if (preview) return setView({ k: 'set', file: view.file, id: 'preview', until });
    const res = await setPlanFormat({ documentId: view.documentId, name: view.file.replace(/\.[^.]+$/, ''), sections: view.sections });
    if (!res.success || !res.id) return setView({ k: 'failed', message: res.error ?? 'The format wasn’t set.' });
    before.current = name;
    setName(view.file.replace(/\.[^.]+$/, ''));
    setView({ k: 'set', file: view.file, id: res.id, until, prior: res.prior ?? null });
  };
  const learns = (
    <section className="art">
      <header className="art-h">
        <div className="hd">
          <span className="t">It learns as you go</span>
        </div>
      </header>
      <div className="lrn">
        <div className="r">
          <Icon icon={Check} size={20} />
          <span>Drills you keep, and ones you swap out</span>
        </div>
        <div className="r">
          <Icon icon={Clock} size={20} />
          <span>How long you run each block</span>
        </div>
        <div className="r">
          <Icon icon={Users} size={20} />
          <span>How you split the groups</span>
        </div>
        <div className="ft">{published ? `From the ${published} plans you’ve published. Nothing to set up.` : 'From the plans you publish. Nothing to set up.'}</div>
      </div>
    </section>
  );
  const shownName = view.k === 'set' ? view.file.replace(/\.[^.]+$/, '') : name;
  return (
    <main className="ch-page ch-cpv ch-cpv-fmt" data-ch="plan-format">
      {phone ? (
        <PhoneTop title="Plan format" back={{ label: 'Practice', onBack: () => router.push('/golf/dashboard/practice') }} />
      ) : (
        <Link href="/golf/dashboard/practice" className="ch-cpv-fmt__back">
          <Icon icon={ChevronLeft} size={16} />
          Practice
        </Link>
      )}
      {!phone && <h1 className="ch-cpv-fmt__t">Plan format</h1>}
      {view.k === 'reading' && (
        <section className="art">
          <header className="art-h">
            <span className="tile">
              <Icon icon={FileText} size={18} />
            </span>
            <div className="hd">
              <span className="t">{view.file}</span>
              <span className="m">{view.meta}</span>
            </div>
          </header>
          <Sample />
          <div className="scanrow" role="status">
            <i className="dot" />
            Reading {view.file}
          </div>
        </section>
      )}
      {view.k === 'found' && (
        <section className="art fsum">
          <header className="art-h">
            <span className="tile">
              <Icon icon={FileText} size={18} />
            </span>
            <div className="hd">
              <span className="t">Here’s your format</span>
              <span className="m">{plural(view.sections.length, 'section')}. New plans follow this layout. The drills and times still come from your data.</span>
            </div>
          </header>
          <Sample found />
          {view.sections.map((s) => (
            <div className="fs" key={s.key}>
              <span className="okc">
                <Icon icon={Check} size={12} />
              </span>
              <div>
                <b>{s.name}</b>
                <span>{LINE[s.key]}</span>
              </div>
            </div>
          ))}
          <div className="acts is-pad">
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Try another
            </Button>
            <Button variant="primary" className="is-fill" onClick={() => void use()}>
              Use this format
            </Button>
          </div>
        </section>
      )}
      {view.k === 'set' && (
        <section className="art">
          <div className="rcpt-h">
            <span className="okb">
              <Icon icon={CircleCheck} size={18} />
            </span>
            <div className="hd">
              <span className="t">Your format is set</span>
              <span className="m">Plans from Ask and the builder now use it.</span>
            </div>
          </div>
          <div className="rlinks">
            {see && <a href={see.href}>{see.label}</a>}
            {undoOpen && (
              <button
                type="button"
                onClick={() => {
                  if (preview) return setView({ k: 'empty' });
                  void undoPlanFormat({ id: view.id, prior: view.prior ?? null })
                    .then((r) => {
                      if (!r.success) return setView({ k: 'failed', message: 'That didn’t undo. Your format is still set.' });
                      setName(before.current);
                      setView({ k: 'empty' });
                    })
                    .catch(() => setView({ k: 'failed', message: 'That didn’t undo. Your format is still set.' }));
                }}
              >
                Undo
              </button>
            )}
          </div>
        </section>
      )}
      {(view.k === 'empty' || view.k === 'failed') && (
        <section className="art fintro">
          <header className="art-h">
            <span className="tile">
              <Icon icon={FileText} size={18} />
            </span>
            <div className="hd">
              <span className="t">Use the plan you already use</span>
              <span className="m">Upload one practice plan you like. CoachHelm builds every new plan in that layout.</span>
            </div>
          </header>
          {view.k === 'failed' && (
            <p className="inert is-fail is-pad" role="alert">
              {view.message}
            </p>
          )}
          <div className="acts is-pad">
            <Button variant="primary" size="lg" className="is-wide" onClick={() => setSheet(true)}>
              Upload a plan
            </Button>
          </div>
          <div className="fhint">A PDF, a photo of a printed sheet, or a Word or Excel file.</div>
        </section>
      )}
      {learns}
      <section className="art cur">
        <span>Current format</span>
        <span className="m">{shownName}</span>
      </section>
      <FormSheet open={sheet} onClose={() => setSheet(false)} title="Upload a plan" actionLabel="Done" onAction={() => setSheet(false)}>
        <div className="ch-cpv ch-cpv-sheet">
          {/* The three ways in differ: any file, the photo library, the camera itself. In the sheet: outside a modal they're inert. */}
          <input ref={fileInput} type="file" accept="application/pdf,image/*,.doc,.docx,.xls,.xlsx" hidden onChange={onFile} />
          <input ref={libraryInput} type="file" accept="image/*" hidden onChange={onFile} />
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
          {picked ? (
            <div className="grp">
              <div className="pickf">
                <span className="thb" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <b>{picked.name}</b>
                  {picked.meta}
                </span>
              </div>
            </div>
          ) : (
            <div className="grp">
              <button type="button" className="upopt" onClick={() => fileInput.current?.click()}>
                <Icon icon={FileText} size={22} />
                Choose file
              </button>
              <button type="button" className="upopt" onClick={() => libraryInput.current?.click()}>
                <Icon icon={ImageIcon} size={22} />
                Photo library
              </button>
              <button type="button" className="upopt" onClick={() => cameraInput.current?.click()}>
                <Icon icon={Camera} size={22} />
                Take a photo
              </button>
            </div>
          )}
        </div>
      </FormSheet>
    </main>
  );
}
