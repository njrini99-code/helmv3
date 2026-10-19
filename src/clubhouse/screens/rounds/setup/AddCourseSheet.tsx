'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, ImagePlus, Info } from 'lucide-react';
import { ALLOWED_COURSE_IMAGE_MIME, MAX_COURSE_IMAGE_BYTES } from '@/lib/golf/course-library';
import type { ChTeeColor } from '../../../data/rounds-shape';
import { haptic } from '../../../lib/haptics';
import { roving } from '../../../ui/use-roving';
import { Icon } from '../../../ui/Icon';
import { Checkbox } from '../../../ui/Checkbox';
import { Modal } from '../../../ui/Modal';
import { HoleConfig } from './HoleConfig';
import { blankHoles, holeIssue, parOf, yardsOf, type ChSetupHole, type ChSetupPick } from './shape';

const STEPS = ['Course', 'Tee', 'Holes', 'Review'] as const;
const LEADS = ['Name it and say where it is', 'The tees you’re playing', 'Par and yardage, hole by hole', 'Check it over'] as const;
const COLORS: Array<[ChTeeColor, string]> = [
  ['black', 'Black'],
  ['blue', 'Blue'],
  ['white', 'White'],
  ['gold', 'Gold'],
  ['red', 'Red'],
  ['green', 'Green'],
];

/** The course-name and tee-rating checks, in words (CH-11108), or null. */
export function addCourseIssue(step: number, f: { name: string; rating: string; slope: string; teeName: string }, holes: ChSetupHole[]): string | null {
  if (step === 0) return f.name.trim().length < 3 ? 'Enter the course’s name' : null;
  if (step === 1) {
    if (!f.teeName.trim()) return 'Name the tees you’re playing';
    const r = parseFloat(f.rating);
    if (f.rating.trim() && (!Number.isFinite(r) || r < 55 || r > 80)) return 'A course rating is between 55 and 80';
    const s = parseInt(f.slope, 10);
    if (f.slope.trim() && (!Number.isFinite(s) || s < 55 || s > 155)) return 'A slope is between 55 and 155';
    return null;
  }
  if (step === 2) return holes.map(holeIssue).find(Boolean) ?? null;
  return null;
}

/**
 * CH-11511: a course typed in by hand, for this round (board `AddCourse`, in
 * four steps: course, tee, holes, review). A player can't add library courses
 * (the library's add is coach-only), so this course is the round's own; with
 * "Save this course" (on by default) the round's start saves it and offers it
 * to the library, the legacy screen's opt-in (Q-72h).
 * The board's course photo is left out (Q-72a).
 */
export function AddCourseSheet({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (pick: ChSetupPick, holes: ChSetupHole[], count: 9 | 18, saveCourse: boolean, coursePhoto: File | null) => void;
}) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ name: '', city: '', state: '', teeName: '', color: null as ChTeeColor | null, rating: '', slope: '' });
  const [count, setCount] = useState<9 | 18>(18);
  const [save, setSave] = useState(true);
  const [holes, setHoles] = useState<ChSetupHole[]>(() => blankHoles(18));
  // The course's photo, the team's own (owner, 2026-10-16): chosen here, shown at once from the file, uploaded with the
  // course when the round's start saves it.
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoIssue, setPhotoIssue] = useState<string | null>(null);
  const choosePhoto = (file: File | undefined) => {
    if (!file) return;
    if (!(ALLOWED_COURSE_IMAGE_MIME as readonly string[]).includes(file.type)) return setPhotoIssue('Use a JPG, PNG, WebP or AVIF photo');
    if (file.size > MAX_COURSE_IMAGE_BYTES) return setPhotoIssue('A photo is 5 MB at most');
    setPhotoIssue(null);
    setPhoto(file);
  };
  const issue = addCourseIssue(step, f, holes);
  const filled = holes.filter((h) => !holeIssue(h)).length;
  const place = [f.city.trim(), f.state.trim().toUpperCase()].filter(Boolean).join(', ') || null;
  const close = () => {
    setStep(0);
    setPhoto(null);
    onClose();
  };
  const done = () => {
    haptic('success');
    const r = parseFloat(f.rating);
    const s = parseInt(f.slope, 10);
    onDone(
      {
        courseId: null,
        courseName: f.name.trim(),
        place,
        city: f.city.trim() || null,
        state: f.state.trim().toUpperCase() || null,
        teeId: null,
        teeName: f.teeName.trim(),
        teeColor: f.color,
        rating: Number.isFinite(r) ? r : null,
        slope: Number.isFinite(s) ? s : null,
        yards: yardsOf(holes),
      },
      holes,
      count,
      save,
      photo,
    );
    setStep(0);
    setPhoto(null);
  };
  const setCountAndCard = (n: 9 | 18) => {
    setCount(n);
    setHoles((hs) => (n === 9 ? hs.slice(0, 9) : [...hs, ...blankHoles(18).slice(hs.length)]));
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a course"
      description={`Step ${step + 1} of 4 · ${LEADS[step]}`}
      width={880}
      code="CH-11511"
      // A form: the course's name takes the keys as it opens.
      initialFocus=".ch-rsu-in--big"
      footer={
        <>
          <span className="ch-rsu-grow ch-rsu-foot-note" role="status" aria-live="polite" data-ch-code={issue ? 'CH-11108' : undefined}>
            {issue ?? ['Name and place', 'One tee set', `${filled} of ${count} holes`, 'Ready for this round'][step]}
          </span>
          {step > 0 ? (
            <button type="button" className="ch-btn ch-btn--ghost" onClick={() => setStep(step - 1)}>
              <Icon icon={ChevronLeft} size={15} />
              <span>{STEPS[step - 1]}</span>
            </button>
          ) : (
            <button type="button" className="ch-btn ch-btn--ghost" onClick={close}>
              <span>Cancel</span>
            </button>
          )}
          <button type="button" className="ch-btn ch-btn--primary" disabled={!!issue} onClick={() => (step < 3 ? setStep(step + 1) : done())}>
            <span>{step < 3 ? `Next: ${STEPS[step + 1]}` : 'Use this course'}</span>
            <Icon icon={step < 3 ? ArrowRight : Check} size={15} />
          </button>
        </>
      }
    >
      <div className={`ch-acs is-step-${step}` + (step === 2 ? ' is-wide' : '')}>
        <div className="ch-acs__main">
          <ol className="ch-rsu-spine ch-rsu-spine--sm" aria-label="Steps">
            {STEPS.map((s, i) => (
              <li key={s} className={i < step ? 'is-done' : i === step ? 'is-on' : ''} aria-current={i === step ? 'step' : undefined}>
                <i aria-hidden="true" />
                <em>{s}</em>
              </li>
            ))}
          </ol>
          {step === 0 && (
            <div className="ch-rsu-form">
              <label className="ch-rsu-field">
                <span>Course name</span>
                <input
                  className="ch-rsu-in ch-rsu-in--big"
                  value={f.name}
                  onChange={(e) => setF({ ...f, name: e.target.value })}
                      placeholder="Chapel Ridge Golf Club"
                  autoComplete="off"
                />
              </label>
              <div className="ch-rsu-2">
                <label className="ch-rsu-field">
                  <span>City</span>
                  <input className="ch-rsu-in" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} autoComplete="off" />
                </label>
                <label className="ch-rsu-field">
                  <span>State</span>
                  <input className="ch-rsu-in" value={f.state} maxLength={2} onChange={(e) => setF({ ...f, state: e.target.value })} autoComplete="off" />
                </label>
              </div>
              <div className="ch-rsu-field">
                <span>Holes</span>
                <div className="ch-rsu-seg" role="radiogroup" aria-label="Holes" {...roving}>
                  {([18, 9] as const).map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={count === n} onClick={() => setCountAndCard(n)}>
                      {n} holes
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {step === 1 && (
            <div className="ch-rsu-form">
              <div className="ch-rsu-field">
                <span>Tee colour</span>
                <div className="ch-rsu-sw" role="radiogroup" aria-label="Tee colour" {...roving}>
                  {COLORS.map(([c, n]) => (
                    <button
                      key={c}
                      type="button"
                      role="radio"
                      aria-checked={f.color === c}
                      aria-label={n}
                      onClick={() => {
                        haptic('select');
                        setF({ ...f, color: c, teeName: f.teeName || n });
                      }}
                    >
                      <i className={`ch-rd-tee ch-rd-tee--${c}`} />
                    </button>
                  ))}
                </div>
              </div>
              <label className="ch-rsu-field">
                <span>Tee name</span>
                <input className="ch-rsu-in" value={f.teeName} onChange={(e) => setF({ ...f, teeName: e.target.value })} placeholder="Blue" autoComplete="off" />
              </label>
              <div className="ch-rsu-2">
                <label className="ch-rsu-field">
                  <span>Course rating (optional)</span>
                  <input className="ch-rsu-in" inputMode="decimal" value={f.rating} onChange={(e) => setF({ ...f, rating: e.target.value })} placeholder="72.8" autoComplete="off" />
                </label>
                <label className="ch-rsu-field">
                  <span>Slope (optional)</span>
                  <input className="ch-rsu-in" inputMode="numeric" value={f.slope} onChange={(e) => setF({ ...f, slope: e.target.value })} placeholder="134" autoComplete="off" />
                </label>
              </div>
              <p className="ch-rsu-note">
                <Icon icon={Info} size={14} />
                Rating and slope are on the scorecard, usually beside the tee name.
              </p>
            </div>
          )}
          {step === 2 && <HoleConfig holes={holes} baseline={null} count={count} nine="front" onHoles={setHoles} onNine={() => {}} />}
          {step === 3 && (
            <div className="ch-rsu-rv">
              <dl className="ch-acs-sum">
                <div>
                  <dt>Course</dt>
                  <dd>{f.name.trim()}</dd>
                </div>
                <div>
                  <dt>Where</dt>
                  <dd>{place ?? '—'}</dd>
                </div>
                <div>
                  <dt>Holes</dt>
                  <dd className="ch-num">
                    {count} · par {parOf(holes)} · {yardsOf(holes).toLocaleString('en-US')} yds
                  </dd>
                </div>
                <div>
                  <dt>Tees</dt>
                  <dd>
                    <i className={f.color ? `ch-rd-tee ch-rd-tee--${f.color}` : 'ch-rd-tee'} aria-hidden="true" />
                    {f.teeName.trim()}
                  </dd>
                </div>
                <div>
                  <dt>Rating / slope</dt>
                  <dd className="ch-num">{f.rating || f.slope ? `${f.rating || '—'} / ${f.slope || '—'}` : '—'}</dd>
                </div>
              </dl>
              <Checkbox checked={save} onChange={setSave}>
                Save this course for next time, and offer it to the course library for your teammates
              </Checkbox>
            </div>
          )}
        </div>
        {step !== 2 && (
          <CoursePreview
            name={f.name}
            photo={photo}
          photoIssue={photoIssue}
          onPhoto={choosePhoto}
          onClearPhoto={() => setPhoto(null)}
          saved={save}
            place={place}
            meta={filled === count ? `Par ${parOf(holes)} · ${count} holes` : `${count} holes`}
            tee={f.teeName.trim() ? { name: f.teeName.trim(), color: f.color, yards: filled === count ? yardsOf(holes) : null } : null}
          />
        )}
      </div>
    </Modal>
  );
}

/**
 * The course as the picker will show it, filling in as it is typed: its photo (the team's own, chosen here; a quiet
 * slot until then), the name (a placeholder until there is one), the place, the holes and par, and the tees once
 * named. Desktop only; the phone sheet has no room beside the form.
 */
function CoursePreview({
  name,
  place,
  meta,
  tee,
  photo,
  photoIssue,
  onPhoto,
  onClearPhoto,
  saved,
}: {
  name: string;
  place: string | null;
  meta: string;
  tee: { name: string; color: ChTeeColor | null; yards: number | null } | null;
  photo: File | null;
  photoIssue: string | null;
  onPhoto: (file: File | undefined) => void;
  onClearPhoto: () => void;
  saved: boolean;
}) {
  const shown = name.trim();
  return (
    <aside className="ch-acs__preview" aria-label="How the course will look">
      <span className="ch-acs__k">Preview</span>
      <label
        className={'ch-cpk__media ch-acs__photo' + (photo ? '' : ' is-blank')}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onPhoto(e.dataTransfer.files[0]);
        }}
      >
        <input type="file" accept={ALLOWED_COURSE_IMAGE_MIME.join(',')} className="ch-sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
        {photo ? (
          <>
            <LocalPhoto file={photo} />
            <span className="ch-acs__photo-change">Change photo</span>
          </>
        ) : (
          <span className="ch-acs__photo-add">
            <Icon icon={ImagePlus} size={20} />
            <b>Add a photo</b>
            <span>JPG, PNG, WebP or AVIF, up to 5 MB</span>
          </span>
        )}
      </label>
      {photoIssue && (
        <span className="ch-acs__photo-error" role="alert">
          {photoIssue}
        </span>
      )}
      {photo && (
        <button type="button" className="ch-acs__photo-remove" onClick={onClearPhoto}>
          Remove photo
        </button>
      )}
      {photo && !saved && <span className="ch-acs__photo-note">The photo is kept only when the course is saved.</span>}
      <span className="ch-cpk__row">
        <span className="ch-cpk__b">
          <b className={shown ? undefined : 'is-empty'}>{shown || 'Course name'}</b>
          <span className={place ? undefined : 'is-empty'}>{place ?? 'City, ST'}</span>
        </span>
        <span className="ch-cpk__meta ch-num">{meta}</span>
      </span>
      {tee && (
        <span className="ch-acs__tee">
          <i className={tee.color ? `ch-rd-tee ch-rd-tee--${tee.color}` : 'ch-rd-tee'} aria-hidden="true" />
          <b>{tee.name} tees</b>
          {tee.yards ? <span className="ch-num">{tee.yards.toLocaleString('en-US')} yds</span> : null}
        </span>
      )}
    </aside>
  );
}

/**
 * The chosen photo drawn straight from the file's pixels, cropped to fill the frame as the course's picture is
 * (object-fit: cover): the file never becomes a URL on the page. Nothing is drawn where the browser can't decode it.
 */
function LocalPhoto({ file }: { file: File }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof createImageBitmap !== 'function') return;
    let bitmap: ImageBitmap | null = null;
    let live = true;
    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!bitmap || !w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const scale = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height);
      const dw = bitmap.width * scale;
      const dh = bitmap.height * scale;
      canvas.getContext('2d')?.drawImage(bitmap, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
    };
    createImageBitmap(file).then(
      (b) => {
        if (!live) return b.close();
        bitmap = b;
        draw();
      },
      () => {},
    );
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(draw) : null;
    ro?.observe(canvas);
    return () => {
      live = false;
      ro?.disconnect();
      bitmap?.close();
    };
  }, [file]);
  return <canvas ref={ref} aria-hidden="true" />;
}
