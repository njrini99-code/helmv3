/**
 * Schedule Vision Extractor
 *
 * Server-only. Sends a photo/screenshot of a class schedule through the
 * Vercel AI Gateway to a Claude vision model and returns structured classes.
 *
 * Design notes:
 * - The model is instructed to normalize days/times itself (that is the whole
 *   point of using vision + an LLM instead of regex), but the mapper below
 *   re-validates every field defensively — a coach/player must never see a
 *   half-parsed row. Invalid times degrade to '' (the Confirm modal lets the
 *   player fill them in) rather than dropping the class.
 * - Output maps into the existing `ParsedClass` shape from
 *   `@/lib/utils/schedule-parser` so the ConfirmClassesModal → save →
 *   calendar-sync pipeline is reused unchanged.
 * - Model routed through the gateway like all other LLM calls in this repo
 *   (see src/lib/coachhelm/v3/llm/compose.ts). This call is player-initiated
 *   and returns structured data only, so it does not go through compose()'s
 *   coach-budget/citation pipeline.
 */
import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { detectSemester, type ParsedClass } from '@/lib/utils/schedule-parser';

// Gateway slug per https://vercel.com/changelog/opus-4-8-on-ai-gateway
// (note the dot — the gateway catalog differs from Anthropic's first-party
// "claude-opus-4-8" ID). Env var is the override hatch if the catalog moves.
const SCHEDULE_VISION_MODEL =
  process.env.SCHEDULE_VISION_MODEL ?? 'anthropic/claude-opus-4.8';

const meetingDaySchema = z.enum(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);

const extractedClassSchema = z.object({
  course_code: z
    .string()
    .describe('Department + number, e.g. "BIOL 1010" or "ECON 201-003". Empty string if not shown.'),
  course_name: z
    .string()
    .describe('Human course title, e.g. "Principles of Microeconomics". If only a code is shown, repeat the code here.'),
  section_kind: z
    .enum(['lecture', 'lab', 'recitation', 'seminar', 'studio', 'other', 'unknown'])
    .describe('Linked lab/recitation sections are SEPARATE entries from their lecture.'),
  days: z
    .array(meetingDaySchema)
    .describe('Normalized meeting days. Empty array for online/asynchronous/arranged ("ARR"/"TBA") classes.'),
  start_time: z
    .string()
    .describe('24-hour "HH:MM" (e.g. "09:05", "14:30"). Empty string if no meeting time.'),
  end_time: z.string().describe('24-hour "HH:MM". Empty string if no meeting time.'),
  location: z
    .string()
    .describe('Building + room as displayed, e.g. "Bryan Hall 213". Empty string if not shown or online.'),
  instructor: z.string().describe('Instructor name as displayed. Empty string if not shown.'),
  confidence: z
    .number()
    .describe('0-1. Lower it when the row was cropped, blurry, truncated, or you had to guess.'),
  note: z
    .string()
    .describe('Only for things the player must review: "time cropped in screenshot", "second half of semester only (Oct 14 - Dec 6)", etc. Usually empty.'),
});

const extractionSchema = z.object({
  is_class_schedule: z
    .boolean()
    .describe('False if the image is not a class schedule (degree audit, tuition bill, grade report, exam schedule, syllabus, random photo...).'),
  document_kind: z
    .string()
    .describe('What the image actually shows, e.g. "Workday weekly calendar", "Banner list view", "photo of printed schedule", "tuition statement".'),
  term: z
    .string()
    .describe('Term as displayed, e.g. "Fall 2026". Empty string if not visible.'),
  classes: z.array(extractedClassSchema),
  warnings: z
    .array(z.string())
    .describe('Screenshot-level problems: cropped columns, cut-off rows at top/bottom, glare over a region, duplicate rows from a scrolled capture that you de-duplicated.'),
  image_quality: z.enum(['good', 'fair', 'poor']),
});

export type ScheduleExtraction = z.infer<typeof extractionSchema>;

const EXTRACTION_PROMPT = `You are reading an image of a US college student's class schedule (screenshot of a student portal, a schedule-builder app, a calendar view, or a photo of a printed schedule). Extract every class meeting into the structured schema. Be exhaustive and exact — a student-athlete's coach will use this to know when the player is in class, so a wrong day or time is worse than a blank.

HOW TO READ THE LAYOUT
- List/table views (Workday, Banner/Self-Service, PeopleSoft, Jenzabar): one row per section. Columns vary; find the days/times/location columns by their content, not their position. Headers may be cropped out of the screenshot — infer columns from cell content.
- Weekly grid/calendar views (portal week view, Google/Apple Calendar, Coursicle, College Scheduler): days are columns, times are rows. The SAME course appears as multiple blocks — merge blocks of the same course into ONE entry whose days array lists every column it appears in. Course titles inside blocks are often truncated ("Intro to Psych..."); record what is visible without inventing the rest.
- Scrolled/multi-part captures may repeat rows — de-duplicate and add a warning.
- A photo of paper may be skewed or have glare; do your best and lower confidence where obscured.

DAY NOTATION (normalize ALL of these to the enum):
- M=Monday, T/Tu/TU=Tuesday, W=Wednesday, R/TH/Th/H=Thursday, F=Friday, S/SA/Sa=Saturday, U/SU/Su=Sunday
- Compound strings split per letter-group: MWF, MW, TR (=Tue+Thu), TTh/TTH/TuTh (=Tue+Thu), MTWRF, MoWeFr, "M W F", "Mon/Wed/Fri", "Tuesday/Thursday"
- CRITICAL: "R" and "H" mean THURSDAY. "TR" is Tuesday+Thursday, never Thursday alone or Tue+"R".
- DAY-PILL TRAP (Workday/Banner): many portals print a fixed strip of ALL SEVEN day labels ("Su Mo Tu We Th Fr Sa" or "M T W R F S U") for every class, with only the actual meeting days bolded/filled/highlighted. Read the highlighted state — never transcribe all seven letters as meeting days.
- "Days: TBA", "ARR", "Arranged", "Online", "Asynchronous", "ASYNC", "Web" → days: [] and empty times.

TIME NOTATION (normalize to 24-hour HH:MM):
- "9:05a - 9:55a", "09:05 AM", "2-3:15p", "1400-1515", "0800-0915", "8:00-8:50", legacy "905A"/"1215P" (A/P directly on the digits), separators "-", "–", "to"
- A range like "2:00-3:15" with no meridiem on a college schedule: 8-11 start = AM; 12-7 start = PM. A bare "12:00" with no marker: treat as noon, lower confidence, and add a note.
- Do NOT read credit hours ("3.000", "4 cr", variable "1.00-4.00" — which visually mimics a time range), CRNs (5-digit numbers), or section numbers as times.

WHAT COUNTS AS A CLASS
- Every meeting section is its own entry: a lecture and its linked lab/recitation/discussion are SEPARATE entries (they meet at different times), even when the portal groups them under one course.
- Include half-semester / A-B session classes; put the date range in note. Two sections of the same course with DIFFERENT date ranges are two entries — do not dedupe them.
- Cross-listed codes joined by a slash ("KIN 101 / PEDU 101") are ONE class — keep the first code, mention the other in note.
- Instructor "Staff" or "TBA" is valid data — record it as displayed.
- Truncated titles: transcribe exactly what is visible (a trailing "…" is fine) — never complete the name.
- Exclude: waitlisted-only rows marked as such, dropped/withdrawn rows, exam-schedule rows, final-exam-only blocks (Workday adds one per course near term end), office hours, and "busy"/blocked-time entries from schedule-builder apps (gray/hatched blocks like "Busy: Practice").

IF MULTIPLE IMAGES ARE PROVIDED: they are sequential slices of ONE tall scrolling capture, top to bottom, with slight overlap between consecutive slices. Treat them as a single document and de-duplicate rows that appear in the overlap.

IF THE IMAGE IS NOT A SCHEDULE: set is_class_schedule=false, say what it is in document_kind, and return zero classes. Do not force non-schedule content into the schema.`;

export interface ScheduleImageInput {
  base64: string;
  mediaType: string;
}

/** Raw vision call. Throws on gateway/model errors (caller handles). */
export async function extractScheduleFromImage(
  images: ScheduleImageInput[],
): Promise<ScheduleExtraction> {
  const res = await generateObject({
    model: SCHEDULE_VISION_MODEL,
    schema: extractionSchema,
    messages: [
      {
        role: 'user',
        content: [
          ...images.map((img) => ({
            type: 'image' as const,
            image: img.base64,
            mediaType: img.mediaType,
          })),
          { type: 'text' as const, text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });
  return res.object;
}

// ============================================================================
// Mapping into the existing ParsedClass pipeline
// ============================================================================

const DAY_TO_PARSED: Record<z.infer<typeof meetingDaySchema>, string> = {
  MON: 'M',
  TUE: 'T',
  WED: 'W',
  THU: 'Th',
  FRI: 'F',
  SAT: 'Sa',
  SUN: 'Su',
};

/** Defensive re-validation: keep only well-formed "HH:MM", else ''. */
export function normalizeTime24(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const hours = Number(m[1] ?? -1);
  const minutes = Number(m[2] ?? -1);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * "Bryan Hall 213" → { building: "Bryan Hall", room: "213" } (Banner order).
 * "627 Thackeray Hall" → { building: "Thackeray Hall", room: "627" }
 * (PeopleSoft prints room BEFORE building).
 */
export function splitLocation(location: string): { building: string; room: string } {
  const trimmed = location.trim();
  if (!trimmed) return { building: '', room: '' };
  const parts = trimmed.split(/\s+/);
  if (parts.length > 1) {
    const first = parts[0] ?? '';
    const last = parts[parts.length - 1] ?? '';
    if (/\d/.test(last)) {
      return { building: parts.slice(0, -1).join(' '), room: last };
    }
    if (/\d/.test(first)) {
      return { building: parts.slice(1).join(' '), room: first };
    }
  }
  return { building: trimmed, room: '' };
}

export interface MappedScheduleResult {
  classes: ParsedClass[];
  warnings: string[];
  term: string;
  imageQuality: ScheduleExtraction['image_quality'];
}

export function mapExtractionToParsedClasses(
  extraction: ScheduleExtraction,
): MappedScheduleResult {
  const semester = detectSemester(extraction.term || '');
  const warnings = [...extraction.warnings];

  const classes: ParsedClass[] = extraction.classes.map((c) => {
    const start = normalizeTime24(c.start_time);
    const end = normalizeTime24(c.end_time);
    if ((c.start_time && !start) || (c.end_time && !end)) {
      warnings.push(
        `Couldn't confirm the meeting time for ${c.course_code || c.course_name} — please check it.`,
      );
    }
    if (c.confidence < 0.6) {
      warnings.push(
        `Low confidence on ${c.course_code || c.course_name}${c.note ? ` (${c.note})` : ''} — please double-check it.`,
      );
    } else if (c.note) {
      warnings.push(`${c.course_code || c.course_name}: ${c.note}`);
    }
    const { building, room } = splitLocation(c.location);
    return {
      id: crypto.randomUUID(),
      course_code: c.course_code.trim(),
      course_name: c.course_name.trim() || c.course_code.trim(),
      instructor: c.instructor.trim(),
      days: c.days.map((d) => DAY_TO_PARSED[d]),
      start_time: start,
      end_time: end,
      location: c.location.trim(),
      building,
      room,
      credits: null,
      semester,
    };
  });

  return {
    classes,
    warnings,
    term: extraction.term,
    imageQuality: extraction.image_quality,
  };
}
