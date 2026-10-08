import type { Recruit, RecruitInput } from '@/app/golf/actions/recruiting';
import type { RecruitDocument } from '@/app/golf/actions/recruit-documents';
import {
  RECRUIT_DOC_MAX_BYTES,
  RECRUIT_FILM_EXTENSIONS,
  RECRUIT_FILM_MAX_BYTES,
  RECRUIT_DOC_MIME_BY_EXT,
  isRecruitFilmExtension,
  recruitDocExtension,
  recruitDocMaxBytes,
} from '@/app/golf/actions/recruit-documents-limits';
import type { ChDivision, ChProgramGender } from './recruiting-calendar';

/**
 * Recruiting (P014): the coach's prospect list, in the shapes the screen draws. Client-safe (only types come from
 * the server actions), so the loader, the screens, the preview and the tests share one set of rules: the four
 * stages, the pipeline's counts and shares, search, sort, the form's draft and its checks, and the labels for
 * dates and files. Behaviour is production's (src/app/golf/actions/recruiting.ts, memory/features/recruiting.md).
 */

export const CH_STAGES = [
  { value: 'watched', label: 'Watched', blurb: 'Tracking from a distance' },
  { value: 'recruiting', label: 'Recruiting', blurb: 'Actively engaged' },
  { value: 'offered', label: 'Offered', blurb: 'Offer extended' },
  { value: 'committed', label: 'Committed', blurb: 'Locked in' },
] as const;
export type ChStage = (typeof CH_STAGES)[number]['value'];

export function stageMeta(stage: ChStage) {
  return CH_STAGES.find((s) => s.value === stage) ?? CH_STAGES[1];
}
export const isStage = (v: unknown): v is ChStage => CH_STAGES.some((s) => s.value === v);

export interface ChProspect {
  id: string;
  firstName: string;
  lastName: string | null;
  /** First and last name, for lists and labels. */
  name: string;
  classYear: number | null;
  email: string | null;
  phone: string | null;
  hometown: string | null;
  state: string | null;
  notes: string | null;
  stage: ChStage;
  createdAt: string;
  updatedAt: string;
  /**
   * The structured next step (P014 C1): a short label and a day ("2026-10-12"). Present only once the columns exist on
   * golf_recruits (migration 20261008120000); the page treats their absence as the feature being off.
   */
  nextStepLabel?: string | null;
  nextStepDate?: string | null;
}

/** The two next-step columns as they come back from `select('*')` once the migration is applied. */
type NextStepColumns = { next_step_label?: string | null; next_step_date?: string | null };
/** What the write actions take, plus the next step. The fields are only sent while the columns exist. */
export type ChRecruitInput = RecruitInput & NextStepColumns;

export const fullName = (first: string, last: string | null | undefined) => [first, last].map((s) => (s ?? '').trim()).filter(Boolean).join(' ');

export function toProspect(r: Recruit): ChProspect {
  return {
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    name: fullName(r.first_name, r.last_name),
    classYear: r.hs_class,
    email: r.email,
    phone: r.phone,
    hometown: r.hometown,
    state: r.state,
    notes: r.notes,
    // The table's own vocabulary; a value it doesn't know reads as Recruiting, as the current page does.
    stage: isStage(r.status) ? r.status : 'recruiting',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    ...nextStepOf(r as Recruit & NextStepColumns),
  };
}

/** The row's next step, only when the row carries the columns at all (absent before the migration is applied). */
function nextStepOf(r: NextStepColumns): Pick<ChProspect, 'nextStepLabel' | 'nextStepDate'> {
  if (!('next_step_label' in r) && !('next_step_date' in r)) return {};
  return { nextStepLabel: r.next_step_label?.trim() || null, nextStepDate: r.next_step_date ? r.next_step_date.slice(0, 10) : null };
}

/** What the server sends the page: the list, whether it could be read, and the server's clock for "2 days ago". */
export interface ChRecruiting {
  prospects: ChProspect[];
  /** The list did not load. It is never drawn as "no prospects". */
  error: boolean;
  /** The server's now (ISO), so the first paint and the browser agree on every relative date. */
  now: string;
  /** The next-step columns exist on golf_recruits (C1). Absent or false: every next-step surface is hidden and never written. */
  nextStep?: boolean;
  /**
   * The program the recruiting calendar reads (C2), from the team (golf_teams.gender) and its organization's division.
   * Absent when the read failed; a null division is the coach's to choose on this device.
   */
  program?: { division: ChDivision | null; gender: ChProgramGender | null };
}

// ── Pipeline: counts, shares, search, sort ─────────────────────────────────

export function countByStage(list: readonly { stage: ChStage }[]): Record<ChStage, number> {
  const counts: Record<ChStage, number> = { watched: 0, recruiting: 0, offered: 0, committed: 0 };
  for (const p of list) counts[p.stage] += 1;
  return counts;
}

/**
 * Each stage's share of the whole list in whole percents that add up to 100 (the board's 3, 3, 1, 1 of 8 read 38%,
 * 38%, 12%, 12%): the largest remainders round up, ties to the earlier stage. `null` when the list is empty.
 */
export function sharesOf(counts: Record<ChStage, number>): Record<ChStage, number> | null {
  const total = CH_STAGES.reduce((n, s) => n + counts[s.value], 0);
  if (total === 0) return null;
  const exact = CH_STAGES.map((s) => (counts[s.value] * 100) / total);
  const floors = exact.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    floors[i]! += 1;
    left -= 1;
  }
  return Object.fromEntries(CH_STAGES.map((s, i) => [s.value, floors[i]!])) as Record<ChStage, number>;
}

export type ChSort = 'updated' | 'name' | 'class' | 'next';
export const CH_SORTS: ReadonlyArray<{ value: ChSort; label: string }> = [
  { value: 'updated', label: 'Recently updated' },
  { value: 'name', label: 'Name' },
  { value: 'class', label: 'Class year' },
];
const NEXT_SORT = { value: 'next', label: 'Next step due' } as const;
/** The sorts on offer: "Next step due" only while the next-step columns exist. */
export const sortsFor = (nextStep: boolean): ReadonlyArray<{ value: ChSort; label: string }> => (nextStep ? [...CH_SORTS, NEXT_SORT] : CH_SORTS);
export const isSort = (v: unknown): v is ChSort => CH_SORTS.some((s) => s.value === v) || v === NEXT_SORT.value;

/** Name, hometown, state, email and notes, as the current page searches them. */
export function matchesQuery(p: ChProspect, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [p.name, p.hometown, p.state, p.email, p.notes].some((v) => (v ?? '').toLowerCase().includes(q));
}

export function sortProspects(list: readonly ChProspect[], sort: ChSort): ChProspect[] {
  return [...list].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    // A prospect with no class year goes last.
    if (sort === 'class') return (a.classYear ?? 9999) - (b.classYear ?? 9999);
    // The soonest next step first; a prospect with none goes last, then most recently updated.
    if (sort === 'next') {
      const x = a.nextStepDate ?? '9999-12-31';
      const y = b.nextStepDate ?? '9999-12-31';
      if (x !== y) return x < y ? -1 : 1;
    }
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
}

/** The rows the list shows: the stage filter, then the search, then the sort. The pipeline's counts ignore the search. */
export function visibleProspects(list: readonly ChProspect[], opts: { stage: ChStage | null; query: string; sort: ChSort }): ChProspect[] {
  return sortProspects(
    list.filter((p) => (!opts.stage || p.stage === opts.stage) && matchesQuery(p, opts.query)),
    opts.sort,
  );
}

// ── Labels ─────────────────────────────────────────────────────────────────

const dayKey = (d: Date, tz?: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

/** "Sep 21", or "Sep 21, 2025" in another year. */
export function dateLabel(iso: string, now: Date, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const sameYear = dayKey(d, tz).slice(0, 4) === dayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
}

/** When a prospect was last touched, as the board writes it: Today, Yesterday, "2 days ago", then the date. `tz` is the viewer's zone once known. */
export function whenLabel(iso: string, now: Date, tz?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const days = Math.round((Date.parse(`${dayKey(now, tz)}T00:00:00Z`) - Date.parse(`${dayKey(d, tz)}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days <= 3) return `${days} days ago`;
  return dateLabel(iso, now, tz);
}

/** "Class of 2027 · Charlotte, NC", leaving out what is not known. */
export function subtitleOf(p: Pick<ChProspect, 'classYear' | 'hometown' | 'state'>): string {
  const place = [p.hometown?.trim(), p.state?.trim()].filter(Boolean).join(', ');
  return [p.classYear ? `Class of ${p.classYear}` : null, place || null].filter(Boolean).join(' · ');
}

/** "2027 · Charlotte, NC" for a phone row. */
export function rowLineOf(p: Pick<ChProspect, 'classYear' | 'hometown' | 'state'>): string {
  const place = [p.hometown?.trim(), p.state?.trim()].filter(Boolean).join(', ');
  return [p.classYear ? String(p.classYear) : null, place || null].filter(Boolean).join(' · ');
}

/** A link target that can't carry a script or a header: only the digits and a leading plus survive in a phone number. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;
export const mailHref = (email: string) => `mailto:${email.trim()}`;

// ── The add and edit form ──────────────────────────────────────────────────

export interface ChDraft {
  first: string;
  last: string;
  email: string;
  phone: string;
  hometown: string;
  state: string;
  classYear: string;
  stage: ChStage;
  notes: string;
  /** The next step's label and day (yyyy-mm-dd), drawn and sent only while the columns exist. */
  nextLabel: string;
  nextDate: string;
}

/** A new prospect starts at Watched, as the Add prospect board does. */
export function draftOf(p?: ChProspect | null): ChDraft {
  return {
    first: p?.firstName ?? '',
    last: p?.lastName ?? '',
    email: p?.email ?? '',
    phone: p?.phone ?? '',
    hometown: p?.hometown ?? '',
    state: p?.state ?? '',
    classYear: p?.classYear != null ? String(p.classYear) : '',
    stage: p?.stage ?? 'watched',
    notes: p?.notes ?? '',
    nextLabel: p?.nextStepLabel ?? '',
    nextDate: p?.nextStepDate ?? '',
  };
}

export const FIELD_LIMITS = { first: 120, last: 120, email: 254, phone: 40, hometown: 120, notes: 5000, nextLabel: 120 } as const;
export const MIN_CLASS_YEAR = 2020;
export const MAX_CLASS_YEAR = 2040;

export type ChDraftField = 'first' | 'last' | 'email' | 'phone' | 'hometown' | 'state' | 'classYear' | 'nextLabel' | 'nextDate' | 'notes';
export interface ChDraftProblem {
  field: ChDraftField;
  code: 'CH-14101' | 'CH-14102' | 'CH-14103' | 'CH-14104' | 'CH-14111';
  message: string;
}

const LABELS: Record<keyof typeof FIELD_LIMITS, string> = { first: 'First name', last: 'Last name', email: 'Email', phone: 'Phone', hometown: 'Hometown', notes: 'Notes', nextLabel: 'Next step' };

/** The same refusals the server makes, before anything is sent, in the order the fields are on the form. */
export function checkDraft(d: ChDraft): ChDraftProblem[] {
  const out: ChDraftProblem[] = [];
  if (!d.first.trim()) out.push({ field: 'first', code: 'CH-14101', message: 'Add a first name.' });
  for (const field of ['first', 'last', 'email', 'phone', 'hometown', 'nextLabel', 'notes'] as const) {
    const value = field === 'notes' ? d.notes : d[field].trim();
    if (value.length > FIELD_LIMITS[field]) {
      out.push({ field, code: 'CH-14104', message: `${LABELS[field]} is too long (${FIELD_LIMITS[field].toLocaleString('en-US')} characters at most).` });
    }
  }
  const state = d.state.trim();
  if (state && !/^[A-Za-z]{2}$/.test(state)) out.push({ field: 'state', code: 'CH-14103', message: 'Use the two-letter state code, like NC.' });
  const year = d.classYear.trim();
  if (year && !(/^\d{4}$/.test(year) && Number(year) >= MIN_CLASS_YEAR && Number(year) <= MAX_CLASS_YEAR)) {
    out.push({ field: 'classYear', code: 'CH-14102', message: `Class year is a four-digit year from ${MIN_CLASS_YEAR} to ${MAX_CLASS_YEAR}.` });
  }
  const day = d.nextDate.trim();
  if (day && !isDay(day)) out.push({ field: 'nextDate', code: 'CH-14111', message: 'Pick a date for the next step.' });
  const order: ChDraftField[] = ['first', 'last', 'email', 'phone', 'hometown', 'state', 'classYear', 'nextLabel', 'nextDate', 'notes'];
  return out.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
}

/** A real calendar day as yyyy-mm-dd. */
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T12:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * What the server action takes. An emptied field is sent empty, and the server stores it as nothing. The next step is
 * sent only when `nextStep` says its columns exist: before the migration, naming them would fail the whole write.
 */
export function inputFromDraft(d: ChDraft, opts: { nextStep?: boolean } = {}): ChRecruitInput {
  const year = d.classYear.trim();
  const next = opts.nextStep ? { next_step_label: d.nextLabel.trim() || null, next_step_date: d.nextDate.trim() || null } : {};
  return {
    ...next,
    first_name: d.first.trim(),
    last_name: d.last.trim(),
    hs_class: year ? Number(year) : null,
    email: d.email.trim(),
    phone: d.phone.trim(),
    hometown: d.hometown.trim(),
    state: d.state.trim().toUpperCase(),
    notes: d.notes.trim(),
    status: d.stage,
  };
}

/** The prospect as the list holds it after a save, before the server's own copy arrives. */
export function prospectFrom(id: string, input: ChRecruitInput, at: { createdAt: string; updatedAt: string }): ChProspect {
  const clean = (s: string | null | undefined) => (s ?? '').trim() || null;
  const first = (input.first_name ?? '').trim();
  return {
    id,
    firstName: first,
    lastName: clean(input.last_name),
    name: fullName(first, input.last_name),
    classYear: input.hs_class ?? null,
    email: clean(input.email),
    phone: clean(input.phone),
    hometown: clean(input.hometown),
    state: clean(input.state),
    notes: clean(input.notes),
    stage: input.status ?? 'watched',
    createdAt: at.createdAt,
    updatedAt: at.updatedAt,
    ...('next_step_label' in input || 'next_step_date' in input ? { nextStepLabel: clean(input.next_step_label), nextStepDate: clean(input.next_step_date) } : {}),
  };
}

// ── The next step (C1) ─────────────────────────────────────────────────────

/** Suggested labels for the next step. The pipeline head counts visits and decisions from the words in a label. */
export const NEXT_STEP_SUGGESTIONS = ['Official visit', 'Unofficial visit', 'Call', 'Evaluation', 'Decision due'] as const;

/** A label that names a visit, a decision, or anything else. Rules only: "visit" is a visit; "decision", "commit" or "deadline" is a decision. */
export function nextStepKind(label: string | null | undefined): 'visit' | 'decision' | 'other' {
  const s = (label ?? '').toLowerCase();
  if (/\bvisit/.test(s)) return 'visit';
  if (/\b(decision|decide|commit|deadline)/.test(s)) return 'decision';
  return 'other';
}

const todayKey = (now: Date, tz?: string) => dayKey(now, tz);
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A step is due when its day is today or earlier, or within the next 14 days. */
export const NEXT_STEP_DUE_DAYS = 14;
export function isNextStepDue(p: Pick<ChProspect, 'nextStepDate'>, now: Date, tz?: string): boolean {
  return !!p.nextStepDate && p.nextStepDate <= addDays(todayKey(now, tz), NEXT_STEP_DUE_DAYS);
}

/**
 * The pipeline head's count: visits dated this calendar month, and decisions due (dated by the end of this month,
 * including any already past). Null when there is nothing to count, so the head says nothing rather than "0 visits".
 */
export function nextStepSummary(list: readonly ChProspect[], now: Date, tz?: string): string | null {
  const today = todayKey(now, tz);
  const month = today.slice(0, 7);
  let visits = 0;
  let decisions = 0;
  for (const p of list) {
    if (!p.nextStepDate) continue;
    const kind = nextStepKind(p.nextStepLabel);
    if (kind === 'visit' && p.nextStepDate.slice(0, 7) === month) visits += 1;
    if (kind === 'decision' && p.nextStepDate.slice(0, 7) <= month) decisions += 1;
  }
  const parts = [
    visits ? `${visits} ${visits === 1 ? 'visit' : 'visits'} this month` : null,
    decisions ? `${decisions} ${decisions === 1 ? 'decision' : 'decisions'} due` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** "Oct 12", or "Oct 12, 2027" in another year, for a yyyy-mm-dd day. */
export function dayLabelOf(day: string, now: Date, tz?: string): string {
  if (!isDay(day)) return '—';
  const sameYear = day.slice(0, 4) === todayKey(now, tz).slice(0, 4);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(new Date(`${day}T12:00:00Z`));
}

/** "Official visit · Oct 12", "Official visit", "Oct 12", or null when there is no next step. */
export function nextStepLine(p: Pick<ChProspect, 'nextStepLabel' | 'nextStepDate'>, now: Date, tz?: string): string | null {
  const parts = [p.nextStepLabel?.trim() || null, p.nextStepDate ? dayLabelOf(p.nextStepDate, now, tz) : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Whether the form holds something different from what it opened with. */
export const isDirty = (a: ChDraft, b: ChDraft) => (Object.keys(a) as Array<keyof ChDraft>).some((k) => a[k] !== b[k]);

// ── Documents ──────────────────────────────────────────────────────────────

export const CH_DOC_CATEGORIES = [
  { value: 'note', label: 'Note' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'transcript', label: 'Transcript' },
  { value: 'film', label: 'Film' },
  { value: 'other', label: 'Other' },
] as const;
export type ChDocCategory = (typeof CH_DOC_CATEGORIES)[number]['value'];

export const categoryLabel = (c: string) => CH_DOC_CATEGORIES.find((x) => x.value === c)?.label ?? 'Other';

export interface ChDocument {
  id: string;
  title: string;
  category: ChDocCategory;
  fileName: string;
  fileType: string | null;
  size: number | null;
  createdAt: string;
}

export function toDocument(r: RecruitDocument): ChDocument {
  const known = CH_DOC_CATEGORIES.some((c) => c.value === r.category);
  return { id: r.id, title: r.title || r.file_name, category: known ? (r.category as ChDocCategory) : 'other', fileName: r.file_name, fileType: r.file_type, size: r.file_size, createdAt: r.created_at };
}

/**
 * The bucket's own ceilings and the extensions its allowlist takes (src/app/golf/actions/recruit-documents-limits.ts,
 * set on the bucket by supabase/migrations/20260930140000_recruit_documents_film.sql): 25 MB for a document or an
 * image, 100 MB for film (MP4, MOV, M4V).
 */
export const MAX_FILE_BYTES = RECRUIT_DOC_MAX_BYTES;
export const MAX_FILM_BYTES = RECRUIT_FILM_MAX_BYTES;
export const DOC_EXTENSIONS = Object.keys(RECRUIT_DOC_MIME_BY_EXT);
export const FILM_EXTENSIONS: readonly string[] = RECRUIT_FILM_EXTENSIONS;
/** Extensions, and the three film types too: on an iPhone a video type is what makes the picker offer the Photo Library. */
export const DOC_ACCEPT = [...DOC_EXTENSIONS.map((e) => `.${e}`), ...new Set(FILM_EXTENSIONS.map((e) => RECRUIT_DOC_MIME_BY_EXT[e]!))].join(',');

export interface ChFileProblem {
  code: 'CH-14105' | 'CH-14106' | 'CH-14107' | 'CH-14108' | 'CH-14109' | 'CH-14110';
  title: string;
  body: string;
}

const mb = (bytes: number) => `${Math.round(bytes / (1024 * 1024))} MB`;

/** Refused before anything is sent, with the bucket's own limits: the type first, then the size its kind of file may be. */
export function screenFile(file: { name: string; size: number }): ChFileProblem | null {
  const ext = recruitDocExtension(file.name);
  if (!DOC_EXTENSIONS.includes(ext)) {
    return { code: 'CH-14106', title: "We can't take that file type", body: 'Use a PDF, an image, a text or spreadsheet file, a Word or PowerPoint document, or film as MP4, MOV or M4V.' };
  }
  const max = recruitDocMaxBytes(ext);
  if (file.size > max) {
    return isRecruitFilmExtension(ext)
      ? { code: 'CH-14105', title: `That film is over ${mb(max)}`, body: 'Choose a shorter clip, or export it at a lower resolution.' }
      : { code: 'CH-14105', title: `That file is over ${mb(max)}`, body: 'Choose a smaller file, or a lower-resolution copy.' };
  }
  return null;
}

/**
 * Storage turned down a file the page let through (the bucket not updated to take film yet, or a project-wide upload
 * limit below the bucket's). Said as it happened, never as a generic failure, and without a limit the page cannot know.
 */
export function refusedProblem(kind: 'size' | 'type', file: { name: string; size: number }): ChFileProblem {
  return kind === 'size'
    ? { code: 'CH-14108', title: "Storage won't take a file this large", body: `${file.name}${sizeLabel(file.size) ? ` (${sizeLabel(file.size)})` : ''} was refused, so nothing was added. Try a smaller file, or keep a link to it in the notes.` }
    : { code: 'CH-14107', title: "Storage won't take that file type", body: `${file.name} was refused, so nothing was added. Try another file, or keep a link to it in the notes.` };
}

/** What a drop held, judged before anything is staged: one file, and a file rather than a folder or nothing. */
export function screenDrop(d: { count: number; folder: boolean; file: { name: string; size: number } | null }): ChFileProblem | null {
  if (d.folder) return { code: 'CH-14110', title: "That isn't a file", body: "A folder can't be added. Drop the file itself." };
  if (d.count > 1) return { code: 'CH-14109', title: 'Drop one file at a time', body: 'Each document gets its own title and category. Drop the first, then the next.' };
  if (!d.file || d.file.size === 0) return { code: 'CH-14110', title: "That isn't a file", body: 'It is empty, or it is a folder. Drop the file itself.' };
  return null;
}

/** One id per Add, or per chosen file, kept across a Retry so a repeat after a lost answer finds what its first attempt did. */
export function newRequestId(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function sizeLabel(bytes: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const stripExtension = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
};
