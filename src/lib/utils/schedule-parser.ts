/**
 * Schedule Parser Utility
 * Parses class schedule text (from PDF or manual input) into structured data.
 *
 * Supports many university schedule formats:
 *   - Tab-separated table exports (most registrar PDFs)
 *   - Space-separated columnar layouts
 *   - Multi-line free-form text (course code + details on subsequent lines)
 *   - Single-line compact formats (code + name + days + time all on one line)
 *   - Comma/pipe/dash delimited rows
 */

// The term windows live in ONE place. detectSemester() used to carry its own
// month buckets, which drifted from the windows parseSemesterDates() generates
// and produced already-ended terms on 15 May and 15 August.
import { inferTermForImport } from '@/lib/golf/semester';

export interface ParsedClass {
  id: string;
  course_code: string;
  course_name: string;
  instructor: string;
  days: string[];
  start_time: string;
  end_time: string;
  location: string;
  building: string;
  room: string;
  credits: number | null;
  semester: string;
  semesterStartDate?: string;
  color?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DAY_PATTERNS: Record<string, string[]> = {
  'MWF':    ['M', 'W', 'F'],
  'MW':     ['M', 'W'],
  'MF':     ['M', 'F'],
  'WF':     ['W', 'F'],
  'TTH':    ['T', 'Th'],
  'TTh':    ['T', 'Th'],
  'TR':     ['T', 'Th'],
  'TUTH':   ['T', 'Th'],
  'TuTh':   ['T', 'Th'],
  'M':      ['M'],
  'T':      ['T'],
  'W':      ['W'],
  'TH':     ['Th'],
  'Th':     ['Th'],
  'R':      ['Th'],
  'F':      ['F'],
  'SA':     ['Sa'],
  'Sa':     ['Sa'],
  'SU':     ['Su'],
  'Su':     ['Su'],
  'MTWTHF': ['M', 'T', 'W', 'Th', 'F'],
  'MTWHF':  ['M', 'T', 'W', 'Th', 'F'],
  'MTWRF':  ['M', 'T', 'W', 'Th', 'F'],
  'MTWR':   ['M', 'T', 'W', 'Th'],
  'MTWF':   ['M', 'T', 'W', 'F'],
  'TWTH':   ['T', 'W', 'Th'],
  'TWR':    ['T', 'W', 'Th'],
  'MWT':    ['M', 'W', 'T'],
};

const INVALID_COURSE_PREFIXES = [
  'FALL', 'SPRING', 'SUMMER', 'WINTER',
  'TIME', 'ROOM', 'BLDG', 'BUILDING',
  'PAGE', 'TOTAL', 'SCHEDULE', 'GRID',
  'WEEKLY', 'DAILY', 'CREDITS', 'CREDIT',
  'DATE', 'TERM', 'CAMPUS', 'STATUS',
  'NOTES', 'UNITS', 'GRADE', 'FINAL',
  // Building words. COURSE_CODE_RE and LOCATION_RE match the SAME shape —
  // 2-5 letters then 3-4 digits — so "Smith Hall 201" on its own line parsed
  // as a course code and became a phantom class ("HALL 201", no days, no
  // times). ROOM/BLDG/BUILDING were already here; these are the rest of the
  // common ones. The denylist alone is not sufficient (any building name
  // works), which is why parseLeadingCourseCode() anchors to the line start.
  'HALL', 'CTR', 'CENTER', 'CENTRE', 'LAB', 'LABS', 'GYM',
  'ANNEX', 'TOWER', 'WING', 'PAVILION', 'COMPLEX', 'ARENA',
  'STE', 'SUITE', 'FLOOR', 'LEVEL', 'AUD', 'THEATER', 'THEATRE',
];

// Lines that indicate section headers, not data
const SKIP_LINE_PATTERNS = [
  /weekly\s*time\s*grid/i,
  /schedule\s*summary/i,
  /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*$/i,
  /^total\s*(credits?|units?|hours?)/i,
  /^page\s+\d/i,
  /^(note|disclaimer|legend)/i,
  /printed\s*(on|at|:)/i,
  /^\*{2,}/,
  /^-{3,}$/,
  /^={3,}$/,
];

// ============================================================================
// HELPERS
// ============================================================================

function generateId(): string {
  return `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function isSkippableLine(line: string): boolean {
  return SKIP_LINE_PATTERNS.some(p => p.test(line));
}

/**
 * A building/room reference in ordinary capitalisation — "Smith Hall 201",
 * "Olin Center 3", "Wilson Lab 12".
 *
 * LOCATION_RE only matches SHOUTED codes (`[A-Z]{2,6}` with no `i` flag), which
 * is right for a registrar column like "WLSN 105" and useless for the way a
 * human-readable schedule writes the same thing. Both are consulted wherever a
 * line has to be told apart from a course title.
 */
const LOCATION_WORD_RE =
  /\b(hall|building|bldg|center|centre|lab|labs|gym|annex|tower|wing|pavilion|complex|arena|auditorium|theat(?:er|re)|room|rm|suite|ste|floor|fl)\b\.?\s*#?\s*\d{1,4}[A-Za-z]?\b/i;

/**
 * Document metadata that is not part of any class — advisor lines, credit
 * totals, holds, GPA summaries. These arrive after the schedule proper, often
 * separated by a blank line, and the course-name fallback was storing them as
 * the name of whichever class happened to be open at the time.
 */
const METADATA_LINE_RE =
  /^\s*(advisor|adviser|advising|total|totals|credits?\s+(earned|attempted|total)|gpa|hold|holds|registration|registered|status|standing|major|minor|degree|catalog|level|college|department|printed|generated|as\s+of|page\s+\d)\b/i;

function looksLikeMetadata(line: string): boolean {
  if (METADATA_LINE_RE.test(line)) return true;
  // "Label: value" where the label is a single short word is document
  // furniture, not a course title ("Advisor: Dr. Jones", "Term: Fall 2026").
  const labelled = line.match(/^\s*([A-Za-z][A-Za-z\s]{0,18}):\s*\S/);
  if (labelled && (labelled[1] ?? '').trim().split(/\s+/).length <= 2) return true;
  return false;
}

// ============================================================================
// COURSE CODE PARSING
// ============================================================================

/** Match patterns like BUAD 123, BUAD123, CS 4301, MATH 2413H */
const COURSE_CODE_RE = /\b([A-Z]{2,5})\s*(\d{3,4}[A-Z]{0,2})\b/i;

function isValidCourseCode(code: string): boolean {
  if (!code) return false;
  const prefix = code.split(/\s+/)[0]?.toUpperCase();
  if (!prefix) return false;
  if (INVALID_COURSE_PREFIXES.includes(prefix)) return false;
  // Must have 2-5 letters then 3-4 digits, optional trailing letter(s)
  if (!code.match(/^[A-Z]{2,5}\s*\d{3,4}[A-Z]{0,2}$/i)) return false;
  return true;
}

function parseCourseCode(text: string): string {
  const match = text.match(COURSE_CODE_RE);
  if (!match || !match[1] || !match[2]) return '';
  const code = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
  return isValidCourseCode(code) ? code : '';
}

/**
 * A course code only STARTS a new class when it leads the line.
 *
 * `parseCourseCode` searches anywhere in the string, which is right for a table
 * CELL but wrong for deciding "is this line a new course?". A location line
 * indented under a class — "Smith Hall 201" — contains a substring that matches
 * COURSE_CODE_RE, so it opened a second, empty class. Anchoring to the start
 * fixes the whole family rather than the building names we happened to list:
 * a course code is written first on its line, a room number never is.
 *
 * Leading list markers are stripped first, so "1. CHEM 101" and "• CHEM 101"
 * still count.
 */
function parseLeadingCourseCode(text: string): string {
  const withoutMarker = text.replace(/^[\s\d.)\]\-–—•*#]+/, '');
  const match = withoutMarker.match(COURSE_CODE_RE);
  if (!match || match.index !== 0 || !match[1] || !match[2]) return '';
  const code = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
  return isValidCourseCode(code) ? code : '';
}

// ============================================================================
// DAY PARSING
// ============================================================================

/**
 * Regex that matches day patterns in the middle of a line.
 * Handles: MWF, TTh, TR, MW, M, T, W, Th, F, MTWTHF, etc.
 * Also handles full day names separated by / or , (Mon/Wed/Fri, Monday, Wednesday)
 */
// js/redos (#559): the inner alternation is genuinely ambiguous — a bare
// "T" matches both `Tu?` (0 u's) and `Th?` (0 h's), and a bare "S" matches
// both `Sa?` and `Su?`. Repeating that ambiguous group unbounded (`*`) lets
// a long run of "S"/"T" characters in untrusted schedule text be partitioned
// exponentially many ways before the trailing `\b` finally fails, which is
// exactly the catastrophic-backtracking shape CodeQL flagged. No real day
// code needs more than all 7 days spelled with their longest 2-letter forms
// (M Tu W Th F Sa Su = 12 chars) — bounding the repeat to a generous 14
// caps the backtracking search space to a small constant (2^14) regardless
// of how long the surrounding text is, without changing what any legitimate
// input matches.
const DAYS_INLINE_RE = /\b((?:M|Tu?|W|Th?|R|F|Sa?|Su?){1,14})\b/;
// The separator alternation must include PLAIN WHITESPACE. It used to be only
// `[/,&]`, which caught "Monday, Wednesday" and "Monday/Wednesday" but not the
// equally common "Monday Wednesday Friday" — that matched just "Monday" and
// stopped, so a MWF class was saved as Monday-only and silently lost two
// thirds of its meetings. The alternation still requires the NEXT token to be
// a day name, so "Monday Physics 200" does not over-match.
const FULL_DAY_RE = /\b((?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)(?:(?:\s*[/,&]\s*|\s+)(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?))*)\b/i;

/**
 * Global twin of FULL_DAY_RE, used ONLY by delimiter detection to blank out the
 * commas inside a weekday list before they are counted as field separators.
 * Kept adjacent so the two patterns cannot drift apart.
 */
const FULL_DAY_LIST_GLOBAL_RE = new RegExp(FULL_DAY_RE.source, 'gi');

function parseDays(daysStr: string): string[] {
  const normalized = daysStr.trim();

  // Try day NAMES first — full or three-letter, which is the same decision.
  //
  // This used to require the full word, so "Mon, Wed, Fri" fell through to the
  // character scan below, where `R` means Thursday (as in "TR") — and "FRI"
  // contains an R. Every class written with three-letter days gained a PHANTOM
  // Thursday meeting, every week, for the whole term. "Fri" on its own returned
  // ["Th","F"].
  //
  // Word-boundaried on purpose: it must catch "Mon"/"Fri" without catching the
  // F and R inside compact codes like "MWF", "TR" or "MTWRF", which are exactly
  // what the character scan is for.
  if (/\b(mon|tues?|wed|thur?s?|fri|sat|sun)(day)?\b/i.test(normalized)) {
    const days: string[] = [];
    if (/mon/i.test(normalized)) days.push('M');
    if (/tue/i.test(normalized)) days.push('T');
    if (/wed/i.test(normalized)) days.push('W');
    if (/thu/i.test(normalized)) days.push('Th');
    if (/fri/i.test(normalized)) days.push('F');
    if (/sat/i.test(normalized)) days.push('Sa');
    if (/sun/i.test(normalized)) days.push('Su');
    return sortDays(days);
  }

  const upper = normalized.toUpperCase().replace(/\s+/g, '');

  // Exact match against known patterns
  for (const [pattern, days] of Object.entries(DAY_PATTERNS)) {
    if (upper === pattern.toUpperCase()) {
      return days;
    }
  }

  // Character-by-character parse (handles arbitrary combos like MTWF)
  const days: string[] = [];
  let remaining = upper;

  // 'TH' and 'R' both mean Thursday — check multi-char tokens first
  if (remaining.includes('TH')) {
    days.push('Th');
    remaining = remaining.replace(/TH/g, '');
  }
  if (remaining.includes('SU')) {
    days.push('Su');
    remaining = remaining.replace(/SU/g, '');
  }
  if (remaining.includes('SA')) {
    days.push('Sa');
    remaining = remaining.replace(/SA/g, '');
  }

  if (remaining.includes('M')) days.push('M');
  // 'T' means Tuesday unless already consumed as part of TH
  if (remaining.includes('T')) days.push('T');
  if (remaining.includes('W')) days.push('W');
  if (remaining.includes('R') && !days.includes('Th')) days.push('Th'); // R = Thursday
  if (remaining.includes('F')) days.push('F');

  return sortDays(days);
}

function sortDays(days: string[]): string[] {
  const order = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  const unique = [...new Set(days)];
  return unique.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/** Try to extract day pattern from a line of text (not greedy) */
function extractDays(line: string): string[] | null {
  // Try full day names first
  const fullMatch = line.match(FULL_DAY_RE);
  if (fullMatch && fullMatch[0]) {
    const parsed = parseDays(fullMatch[0]);
    if (parsed.length > 0) return parsed;
  }

  // Try abbreviation patterns — must be surrounded by word boundaries or separators
  // Look for standalone groups like "MWF", "TTh", "TR", "MW"
  const abbrMatch = line.match(/(?:^|\s|[|,;:\t])([MTWRF]{1,5}h?(?:Th)?)(?:\s|[|,;:\t]|$)/i);
  if (abbrMatch && abbrMatch[1]) {
    const parsed = parseDays(abbrMatch[1]);
    if (parsed.length > 0) return parsed;
  }

  // Fallback: general inline match
  const inlineMatch = line.match(DAYS_INLINE_RE);
  if (inlineMatch && inlineMatch[0] && inlineMatch[0].length >= 1 && inlineMatch[0].length <= 7) {
    const parsed = parseDays(inlineMatch[0]);
    if (parsed.length > 0 && parsed.length <= 7) return parsed;
  }

  return null;
}

// ============================================================================
// TIME PARSING
// ============================================================================

/** Parse a single time value to 24-hour HH:MM */
function parseTime(timeStr: string, inferredPeriod?: string): string {
  const cleaned = timeStr.trim().toUpperCase().replace(/\s+/g, '');

  // Match "9:30AM", "09:30 AM", "1:00PM", "13:00", "900", "0930"
  const match = cleaned.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM|A|P)?\.?/i);
  if (!match || !match[1]) return '';

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  let period = match[3]?.toUpperCase()?.replace(/[^AP]/, '') || inferredPeriod;

  // Normalize A/P to AM/PM
  if (period === 'A') period = 'AM';
  if (period === 'P') period = 'PM';

  // Already in 24-hour format
  if (hours >= 13 && hours <= 23) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  // Smart inference when no AM/PM given
  if (!period && hours <= 12 && hours >= 1) {
    if (inferredPeriod) {
      period = inferredPeriod;
    } else {
      // College class heuristic: 8-11 = AM, 12 = PM, 1-7 = PM
      period = (hours >= 8 && hours <= 11) ? 'AM' : 'PM';
    }
  }

  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

/** Parse a time range like "9:30AM - 10:45AM" or "1:00 - 1:50 PM" */
function parseTimeRange(rangeStr: string): { start: string; end: string } {
  // Split on dash, en-dash, em-dash, or "to"
  const parts = rangeStr.split(/\s*[-–—]\s*|\s+to\s+/i).map(s => s.trim());

  if (parts.length < 2) {
    return { start: parts[0] ? parseTime(parts[0]) : '', end: '' };
  }

  const startStr = parts[0] || '';
  const endStr = parts[1] || '';

  const startPeriod = startStr.match(/(AM|PM|A\.?M\.?|P\.?M\.?)/i)?.[1]?.replace(/\./g, '').toUpperCase();
  const endPeriod = endStr.match(/(AM|PM|A\.?M\.?|P\.?M\.?)/i)?.[1]?.replace(/\./g, '').toUpperCase();

  // Parse end time first (more likely to have AM/PM)
  const endTime = parseTime(endStr);

  // Infer start period from end period
  let inferredStartPeriod = startPeriod;
  if (!startPeriod && endPeriod) {
    const startHour = parseInt(startStr.match(/(\d{1,2})/)?.[1] || '0', 10);
    const endHour = parseInt(endStr.match(/(\d{1,2})/)?.[1] || '0', 10);

    const normalizedEnd = endPeriod === 'A' ? 'AM' : endPeriod === 'P' ? 'PM' : endPeriod;

    // "11:00 - 12:15 PM" → 11 AM to 12:15 PM (crossing noon)
    if (normalizedEnd === 'PM' && endHour === 12 && startHour >= 8 && startHour <= 11) {
      inferredStartPeriod = 'AM';
    }
    // "10:00 - 11:15 AM" → both AM
    // "1:00 - 2:15 PM" → both PM
    // End hour < start hour → crossing meridiem
    else if (endHour < startHour && normalizedEnd === 'PM') {
      inferredStartPeriod = 'AM';
    } else {
      inferredStartPeriod = normalizedEnd;
    }
  }

  const startTime = parseTime(startStr, inferredStartPeriod);
  return { start: startTime, end: endTime };
}

/** Time range regex for matching inside longer strings */
const TIME_RANGE_RE = /(\d{1,2}:\d{2}\s*(?:AM|PM|A\.?M\.?|P\.?M\.?)?)\s*[-–—to]+\s*(\d{1,2}:\d{2}\s*(?:AM|PM|A\.?M\.?|P\.?M\.?)?)/i;
const SINGLE_TIME_RE = /\b(\d{1,2}:\d{2}\s*(?:AM|PM|A\.?M\.?|P\.?M\.?)?)\b/i;

function extractTimeRange(line: string): { start: string; end: string } | null {
  const match = line.match(TIME_RANGE_RE);
  if (match && match[0]) {
    const range = parseTimeRange(match[0]);
    if (range.start) return range;
  }
  return null;
}

// ============================================================================
// LOCATION PARSING
// ============================================================================

function parseLocation(location: string): { building: string; room: string } {
  const cleaned = location.trim();

  // "HAL 101", "ENGR 203B", "Room 305"
  const match = cleaned.match(/^([A-Za-z\s.]+?)\s+(\d+[A-Za-z]?)$/);
  if (match && match[1] && match[2]) {
    return { building: match[1].trim(), room: match[2].trim() };
  }

  return { building: cleaned, room: '' };
}

/** Try to find a location pattern in a line */
const LOCATION_RE = /\b([A-Z]{2,6})\s+(\d{3,4}[A-Za-z]?)\b/;

function extractLocation(line: string): { location: string; building: string; room: string } | null {
  const match = line.match(LOCATION_RE);
  if (match && match[0] && match[1] && match[2]) {
    // Make sure this isn't a course code
    if (isValidCourseCode(`${match[1]} ${match[2]}`)) return null;
    return {
      location: match[0],
      building: match[1],
      room: match[2],
    };
  }
  return null;
}

// ============================================================================
// CREDIT PARSING
// ============================================================================

const CREDITS_RE = /\b(\d(?:\.\d{1,2})?)\s*(?:credits?|units?|hrs?|hours?|cr\.?|crs?\.?)\b/i;
const STANDALONE_CREDITS_RE = /^\s*(\d(?:\.\d)?)\s*$/; // Single digit on its own (in a column)

function extractCredits(line: string): number | null {
  const match = line.match(CREDITS_RE);
  if (match && match[1]) return parseFloat(match[1]);
  return null;
}

// ============================================================================
// INSTRUCTOR PARSING
// ============================================================================

const INSTRUCTOR_RE = /(?:Prof\.?|Dr\.?|Professor|Instructor|Staff|Faculty|TA)\s*[:\s]+([A-Za-z][A-Za-z\s.,'-]+?)(?:\s*[|;]|$)/i;

function extractInstructor(line: string): string | null {
  const match = line.match(INSTRUCTOR_RE);
  if (match && match[1]) return match[1].trim();
  return null;
}

// ============================================================================
// FORMAT DETECTION
// ============================================================================

interface FormatHints {
  isTabDelimited: boolean;
  isCommaDelimited: boolean;
  isPipeDelimited: boolean;
  isSpaceColumnar: boolean;
  hasHeaders: boolean;
  delimiter: string;
}

function detectFormat(lines: string[]): FormatHints {
  let tabCount = 0;
  let commaCount = 0;
  let pipeCount = 0;
  let wideSpaceCount = 0;

  const sampleLines = lines.slice(0, Math.min(lines.length, 15));

  for (const line of sampleLines) {
    if (line.includes('\t')) tabCount++;
    // Only count commas between FIELDS — and a comma-separated weekday list is
    // not a field separator.
    //
    // "Monday, Wednesday, Friday" carries exactly two commas, which met this
    // threshold and classified the whole document as CSV; every row was then
    // split on those commas, tearing the days column into three cells, and the
    // class came back with NO days at all. Two day names ("Tuesday, Thursday")
    // stayed under the threshold and worked, so the failure was invisible until
    // someone pasted a three-day class — i.e. MWF, the most common pattern
    // there is. Slash- and space-separated lists were unaffected, which is why
    // the format matrix in the tests varies the separator too.
    const withoutDayCommas = line.replace(FULL_DAY_LIST_GLOBAL_RE, (m) => m.replace(/,/g, ' '));
    if ((withoutDayCommas.match(/,/g) || []).length >= 2) commaCount++;
    if (line.includes('|')) pipeCount++;
    // Multiple runs of 3+ spaces suggest columnar layout
    if ((line.match(/\s{3,}/g) || []).length >= 2) wideSpaceCount++;
  }

  const total = sampleLines.length || 1;
  const isTabDelimited = tabCount / total > 0.3;
  const isCommaDelimited = !isTabDelimited && commaCount / total > 0.3;
  const isPipeDelimited = !isTabDelimited && !isCommaDelimited && pipeCount / total > 0.3;
  const isSpaceColumnar = !isTabDelimited && !isCommaDelimited && !isPipeDelimited && wideSpaceCount / total > 0.3;

  // Check for header row
  const headerKeywords = ['course', 'title', 'name', 'days', 'time', 'location', 'instructor', 'credits', 'room', 'building', 'section', 'type', 'status', 'crn'];
  const hasHeaders = sampleLines.some(line => {
    const lower = line.toLowerCase();
    return headerKeywords.filter(kw => lower.includes(kw)).length >= 2;
  });

  const delimiter = isTabDelimited ? '\t'
    : isCommaDelimited ? ','
    : isPipeDelimited ? '|'
    : isSpaceColumnar ? '  ' // double-space
    : '\t'; // fallback

  return { isTabDelimited, isCommaDelimited, isPipeDelimited, isSpaceColumnar, hasHeaders, delimiter };
}

// ============================================================================
// TABLE FORMAT PARSER
// ============================================================================

interface ColumnMap {
  course?: number;
  title?: number;
  days?: number;
  time?: number;
  startTime?: number;
  endTime?: number;
  location?: number;
  building?: number;
  room?: number;
  instructor?: number;
  credits?: number;
}

function detectColumns(headerLine: string, delimiter: string): ColumnMap {
  const cols = splitRow(headerLine, delimiter);
  const map: ColumnMap = {};

  cols.forEach((col, idx) => {
    const lower = col.toLowerCase().trim();
    if (lower.includes('course') || lower === 'code' || lower === 'crn' || lower.includes('subj')) map.course = idx;
    else if (lower.includes('title') || lower === 'name' || lower.includes('description')) map.title = idx;
    else if (lower.includes('day') && !lower.includes('today')) map.days = idx;
    else if (lower === 'time' || lower.includes('times') || lower.includes('meeting time')) map.time = idx;
    // Bare `Start` / `End` are the common registrar headings, and requiring
    // BOTH the word and "time" missed them: the columns went unmapped, so a
    // pasted export WITH a header row produced classes with days but no times
    // at all — while the identical rows WITHOUT a header parsed correctly,
    // because the header-less path infers columns from content. Word-boundary
    // matched so "Attendance" cannot be read as an end column.
    else if (/\b(start|begin|from)\b/.test(lower)) map.startTime = idx;
    else if (/\b(end|finish|thru|through|until)\b/.test(lower)) map.endTime = idx;
    else if (lower.includes('location') || lower === 'where') map.location = idx;
    else if (lower.includes('building') || lower === 'bldg') map.building = idx;
    else if (lower.includes('room') || lower === 'rm') map.room = idx;
    else if (lower.includes('instructor') || lower.includes('professor') || lower.includes('prof') || lower.includes('faculty')) map.instructor = idx;
    else if (lower.includes('credit') || lower.includes('unit') || lower.includes('hr') || lower === 'cr') map.credits = idx;
  });

  return map;
}

function splitRow(line: string, delimiter: string): string[] {
  if (delimiter === '  ') {
    // Space-columnar: split on 2+ spaces
    return line.split(/\s{2,}/).map(s => s.trim()).filter(Boolean);
  }
  return line.split(delimiter === '\t' ? /\t+/ : delimiter).map(s => s.trim());
}

function parseTableFormat(lines: string[], semester: string, hints: FormatHints): ParsedClass[] {
  const classes: ParsedClass[] = [];
  const { delimiter } = hints;

  // Find header row
  let headerIndex = -1;
  let columnMap: ColumnMap = {};

  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i];
    if (!line) continue;
    const lower = line.toLowerCase();
    const headerKeywords = ['course', 'title', 'name', 'days', 'time', 'location', 'instructor', 'credits', 'room', 'section'];
    const matchCount = headerKeywords.filter(kw => lower.includes(kw)).length;
    if (matchCount >= 2) {
      headerIndex = i;
      columnMap = detectColumns(line, delimiter);
      break;
    }
  }

  const startRow = headerIndex >= 0 ? headerIndex + 1 : 0;
  const hasColumnMap = Object.keys(columnMap).length > 0;

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i];
    if (!line || isSkippableLine(line)) continue;

    const cols = splitRow(line, delimiter);
    if (cols.length < 2) continue;

    // Find a course code in any column
    let courseCode = '';
    let courseCodeIdx = -1;

    // If we have a header map, try the course column first
    if (hasColumnMap && columnMap.course !== undefined && cols[columnMap.course]) {
      const code = parseCourseCode(cols[columnMap.course]!);
      if (code) {
        courseCode = code;
        courseCodeIdx = columnMap.course;
      }
    }

    // Fallback: scan all columns
    if (!courseCode) {
      for (let j = 0; j < cols.length; j++) {
        const colVal = cols[j];
        if (!colVal) continue;
        const code = parseCourseCode(colVal);
        if (code) {
          courseCode = code;
          courseCodeIdx = j;
          break;
        }
      }
    }

    if (!courseCode) continue;

    const classData: Partial<ParsedClass> = {
      id: generateId(),
      course_code: courseCode,
      semester,
    };

    if (hasColumnMap) {
      // Use header-mapped columns
      if (columnMap.title !== undefined) classData.course_name = cols[columnMap.title]?.trim() || '';
      if (columnMap.days !== undefined && cols[columnMap.days]) classData.days = parseDays(cols[columnMap.days]!);
      if (columnMap.time !== undefined && cols[columnMap.time]) {
        const times = parseTimeRange(cols[columnMap.time]!);
        classData.start_time = times.start;
        classData.end_time = times.end;
      }
      if (columnMap.startTime !== undefined && cols[columnMap.startTime]) {
        classData.start_time = parseTime(cols[columnMap.startTime]!);
      }
      if (columnMap.endTime !== undefined && cols[columnMap.endTime]) {
        classData.end_time = parseTime(cols[columnMap.endTime]!);
      }
      if (columnMap.location !== undefined && cols[columnMap.location]) {
        const loc = parseLocation(cols[columnMap.location]!);
        classData.location = cols[columnMap.location]!.trim();
        classData.building = loc.building;
        classData.room = loc.room;
      }
      if (columnMap.building !== undefined) classData.building = cols[columnMap.building]?.trim() || '';
      if (columnMap.room !== undefined) classData.room = cols[columnMap.room]?.trim() || '';
      if (columnMap.instructor !== undefined) classData.instructor = cols[columnMap.instructor]?.trim() || '';
      if (columnMap.credits !== undefined && cols[columnMap.credits]) {
        const cred = parseFloat(cols[columnMap.credits]!);
        if (!isNaN(cred) && cred > 0 && cred <= 12) classData.credits = cred;
      }
    } else {
      // No header — infer from content
      inferColumnsFromContent(cols, courseCodeIdx, classData);
    }

    if (classData.course_name || classData.start_time || classData.location) {
      classes.push(fillDefaults(classData));
    }
  }

  return classes;
}

/** Infer column meanings from the content itself (no header row) */
function inferColumnsFromContent(cols: string[], courseCodeIdx: number, classData: Partial<ParsedClass>): void {
  for (let j = 0; j < cols.length; j++) {
    if (j === courseCodeIdx) continue;
    const col = cols[j]?.trim();
    if (!col) continue;

    // Time range
    if (!classData.start_time && TIME_RANGE_RE.test(col)) {
      const times = parseTimeRange(col);
      classData.start_time = times.start;
      classData.end_time = times.end;
      continue;
    }

    // Single time value. Delimited exports — tab, CSV, pipe — almost always put
    // start and end in SEPARATE columns, and this branch used to be guarded on
    // `!classData.start_time` alone. The first time column set the start; the
    // second hit the same guard, now false, and was dropped on the floor. Every
    // such schedule therefore produced a class with a start and NO end, which
    // syncs as a calendar event with no duration.
    if (SINGLE_TIME_RE.test(col) && col.match(/\d{1,2}:\d{2}/)) {
      const t = parseTime(col);
      if (!classData.start_time) {
        classData.start_time = t;
        continue;
      }
      // parseTime returns 24-hour "HH:MM", so a lexical compare orders it.
      // Requiring end > start keeps an unrelated later time column (a due date,
      // a second meeting slot) from being mistaken for this class's end.
      if (!classData.end_time && t > classData.start_time) {
        classData.end_time = t;
        continue;
      }
    }

    // Days pattern (short: MWF, TTh)
    if ((!classData.days || classData.days.length === 0) && /^[MTWRFSauhe]{1,7}$/i.test(col)) {
      const days = parseDays(col);
      if (days.length > 0) {
        classData.days = days;
        continue;
      }
    }

    // Credits (standalone number 1-6)
    if (!classData.credits && STANDALONE_CREDITS_RE.test(col)) {
      const n = parseFloat(col);
      if (n >= 0.5 && n <= 6) {
        classData.credits = n;
        continue;
      }
    }

    // Location (BLDG 123 pattern, but not a course code)
    if (!classData.location && LOCATION_RE.test(col)) {
      const loc = extractLocation(col);
      if (loc) {
        classData.location = loc.location;
        classData.building = loc.building;
        classData.room = loc.room;
        continue;
      }
    }

    // Instructor (contains Dr., Prof., or looks like a name)
    if (!classData.instructor && INSTRUCTOR_RE.test(col)) {
      classData.instructor = col;
      continue;
    }

    // Course name — longer string without digits at start, not days
    if (!classData.course_name && col.length > 3 && !/^\d/.test(col) && !/^[MTWRF]{1,5}h?$/i.test(col)) {
      classData.course_name = col;
    }
  }
}

// ============================================================================
// MULTI-LINE FORMAT PARSER
// ============================================================================

function parseMultiLineFormat(lines: string[], semester: string): ParsedClass[] {
  const classes: ParsedClass[] = [];
  let currentClass: Partial<ParsedClass> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || isSkippableLine(line)) continue;

    // Anchored: only a code at the START of the line opens a new class. See
    // parseLeadingCourseCode — an indented "Smith Hall 201" used to open one.
    const courseCode = parseLeadingCourseCode(line);

    if (courseCode) {
      // Flush previous class
      if (currentClass?.course_code) {
        classes.push(fillDefaults(currentClass));
      }

      // `semester` is the term detected from the WHOLE document — a "Fall 2026
      // Schedule" heading, say. It was passed into this function and then never
      // written onto the class, so every class built on this path came back
      // with semester:'' and the caller fell back to detectSemester(''), which
      // is a guess from today's date. A schedule that states its own term was
      // having that term thrown away and replaced with a worse one.
      currentClass = { course_code: courseCode, semester };

      // Extract course name (text after code, before time/days)
      const codeEndIdx = line.search(COURSE_CODE_RE);
      if (codeEndIdx !== -1) {
        const codeLen = courseCode.replace(/\s/g, '').length;
        const afterCode = line.substring(codeEndIdx + codeLen).trim();
        // Take text before any time pattern, day pattern, or credits
        const nameMatch = afterCode.match(/^[-–—|:,]?\s*([A-Za-z][A-Za-z\s&,()/']+?)(?=\s*[-–—|]|\s+[MTWRF]{1,5}|\s+\d{1,2}:\d{2}|\s+\d\s*(?:cr|unit|hr)|$)/i);
        if (nameMatch && nameMatch[1] && nameMatch[1].trim().length > 1) {
          currentClass.course_name = nameMatch[1].trim();
        }
      }

      // Extract everything else from same line
      extractInlineDetails(line, currentClass);
    } else if (currentClass) {
      // Continue extracting details for current class from subsequent lines
      extractInlineDetails(line, currentClass);

      // Course name fallback: if still missing, use a descriptive line.
      //
      // This is the last resort, so its rejections carry the weight. Two kinds
      // of line were slipping through and being stored as the course's NAME:
      //
      //   "Smith Hall 201"     — LOCATION_RE is uppercase-only and unflagged,
      //                          so a normally-capitalised building did not
      //                          match and the room became the course name.
      //   "Advisor: Dr. Jones" — trailing document metadata after a blank line,
      //                          which is not part of any class at all.
      if (!currentClass.course_name && line.length > 5 && !/^\d/.test(line) && !TIME_RANGE_RE.test(line)) {
        const isDayLine = /^[MTWRF]{1,5}h?\s*$/i.test(line);
        const isLocation = LOCATION_RE.test(line) || LOCATION_WORD_RE.test(line);
        if (!isDayLine && !isLocation && !looksLikeMetadata(line)) {
          currentClass.course_name = line;
        }
      }
    } else {
      // No current class and no course code — try to start one from a compact single-line
      const compactClass = tryParseCompactLine(line, semester);
      if (compactClass) {
        classes.push(fillDefaults(compactClass));
      }
    }
  }

  // Flush last class
  if (currentClass?.course_code) {
    classes.push(fillDefaults(currentClass));
  }

  return classes;
}

/** Extract days, time, instructor, location, credits from a line into classData */
function extractInlineDetails(line: string, classData: Partial<ParsedClass>): void {
  // Time range
  if (!classData.start_time) {
    const time = extractTimeRange(line);
    if (time) {
      classData.start_time = time.start;
      classData.end_time = time.end;
    }
  }

  // Days
  if (!classData.days || classData.days.length === 0) {
    const days = extractDays(line);
    if (days && days.length > 0) classData.days = days;
  }

  // Instructor
  if (!classData.instructor) {
    const instr = extractInstructor(line);
    if (instr) classData.instructor = instr;
  }

  // Location
  if (!classData.location) {
    const loc = extractLocation(line);
    if (loc) {
      classData.location = loc.location;
      classData.building = loc.building;
      classData.room = loc.room;
    }
  }

  // Credits
  if (!classData.credits) {
    const creds = extractCredits(line);
    if (creds) classData.credits = creds;
  }
}

/** Try to parse a single compact line that may contain everything */
function tryParseCompactLine(line: string, semester: string): Partial<ParsedClass> | null {
  // Must have at least a time range to be a class line
  const time = extractTimeRange(line);
  if (!time) return null;

  const days = extractDays(line);
  if (!days || days.length === 0) return null;

  const classData: Partial<ParsedClass> = {
    course_code: parseCourseCode(line) || '',
    days,
    start_time: time.start,
    end_time: time.end,
    semester,
  };

  const loc = extractLocation(line);
  if (loc) {
    classData.location = loc.location;
    classData.building = loc.building;
    classData.room = loc.room;
  }

  const creds = extractCredits(line);
  if (creds) classData.credits = creds;

  return classData;
}

// ============================================================================
// DEDUPLICATION & SCORING
// ============================================================================

function deduplicateClasses(classes: ParsedClass[]): ParsedClass[] {
  const classMap = new Map<string, ParsedClass>();

  for (const cls of classes) {
    // Key by course code if available, otherwise by name + time
    const key = cls.course_code
      || `${cls.course_name}|${cls.start_time}`;

    const existing = classMap.get(key);
    if (!existing || scoreClass(cls) > scoreClass(existing)) {
      classMap.set(key, cls);
    }
  }

  return Array.from(classMap.values());
}

function scoreClass(cls: ParsedClass): number {
  let score = 0;
  if (cls.course_code) score += 2;
  if (cls.course_name) score += 2;
  if (cls.instructor) score += 1;
  if (cls.days.length > 0) score += 2;
  if (cls.start_time) score += 2;
  if (cls.end_time) score += 1;
  if (cls.location) score += 1;
  if (cls.building) score += 1;
  if (cls.credits) score += 1;
  return score;
}

function fillDefaults(partial: Partial<ParsedClass>): ParsedClass {
  return {
    id: partial.id || generateId(),
    course_code: partial.course_code || '',
    course_name: partial.course_name || '',
    instructor: partial.instructor || '',
    days: partial.days || [],
    start_time: partial.start_time || '',
    end_time: partial.end_time || '',
    location: partial.location || '',
    building: partial.building || '',
    room: partial.room || '',
    credits: partial.credits ?? null,
    semester: partial.semester || '',
  };
}

// ============================================================================
// SEMESTER DETECTION
// ============================================================================

export function detectSemester(text: string): string {
  // UTC, deliberately, and it is the ONLY zone that keeps this function's
  // answer consistent with the windows it feeds. `inferTermForImport` compares
  // in `utcDay`, and `parseSemesterDates` emits UTC date strings; reading the
  // AMBIENT zone here mixed a local calendar day into a UTC comparison, so the
  // same moment resolved to different terms in a browser (`AddClassModal`, the
  // player's zone) and on Vercel (`schedule-vision`, UTC). At the 15 May and
  // 15 August boundaries that divergence is a whole term — the exact two days
  // this function exists to get right.
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();

  const springMatch = text.match(/spring\s*(\d{4})?/i);
  const fallMatch = text.match(/fall\s*(\d{4})?/i);
  const summerMatch = text.match(/summer\s*(\d{4})?/i);
  const winterMatch = text.match(/winter\s*(\d{4})?/i);

  if (springMatch) return `Spring ${springMatch[1] || year}`;
  if (fallMatch) return `Fall ${fallMatch[1] || year}`;
  if (summerMatch) return `Summer ${summerMatch[1] || year}`;
  if (winterMatch) return `Winter ${winterMatch[1] || year}`;

  // ACADEMIC terms, not calendar months — and derived from the SAME windows
  // parseSemesterDates() generates, rather than a parallel set of month buckets.
  //
  // Those buckets were a second source of truth and they disagreed with the
  // windows at both ends. `month === 7 && day <= 15` returned "Summer", whose
  // window ENDS 15 August: import on that exact day and every occurrence is
  // already in the past, so the calendar stays empty while the toast says
  // "Synced to your calendar". Identical bug on 15 May, the last day of spring.
  // Two days a year, both inside an enrolment rush.
  //
  // inferTermForImport() answers "the soonest term with real time left", which
  // is the term a student importing today is actually enrolling in, and is the
  // same rule the contradicted-label overrule uses.
  const todayIso = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  return inferTermForImport(todayIso) ?? `Fall ${year}`;
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export function parseScheduleText(text: string): ParsedClass[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const semester = detectSemester(text);
  const hints = detectFormat(lines);

  let classes: ParsedClass[];

  if (hints.isTabDelimited || hints.isCommaDelimited || hints.isPipeDelimited || hints.isSpaceColumnar) {
    classes = parseTableFormat(lines, semester, hints);

    // If table parsing found nothing, fall back to multi-line
    if (classes.length === 0) {
      classes = parseMultiLineFormat(lines, semester);
    }
  } else {
    classes = parseMultiLineFormat(lines, semester);
  }

  return deduplicateClasses(classes);
}

// ============================================================================
// DISPLAY HELPERS
// ============================================================================

export function formatTimeDisplay(time: string): string {
  if (!time) return '';
  const parts = time.split(':');
  if (parts.length < 2 || !parts[0] || !parts[1]) return time;

  let hours = parseInt(parts[0], 10);
  const minutes = parts[1];
  const period = hours >= 12 ? 'PM' : 'AM';

  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${period}`;
}

export function formatDaysDisplay(days: string[]): string {
  return days.join('');
}

// Curated palette — muted, non-clashing tones that look great on white/cream
const CLASS_COLORS = [
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F97316', // orange
  '#0EA5E9', // sky
  '#14B8A6', // teal
  '#EF4444', // red
  '#A855F7', // purple
  '#06B6D4', // cyan
  '#F59E0B', // amber
];
let colorIndex = 0;

export function generateClassColor(): string {
  const color = CLASS_COLORS[colorIndex % CLASS_COLORS.length] || '#3B82F6';
  colorIndex++;
  return color;
}
