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

// ============================================================================
// DAY PARSING
// ============================================================================

/**
 * Regex that matches day patterns in the middle of a line.
 * Handles: MWF, TTh, TR, MW, M, T, W, Th, F, MTWTHF, etc.
 * Also handles full day names separated by / or , (Mon/Wed/Fri, Monday, Wednesday)
 */
const DAYS_INLINE_RE = /\b((?:M|Tu?|W|Th?|R|F|Sa?|Su?)(?:(?:M|Tu?|W|Th?|R|F|Sa?|Su?))*)\b/;
const FULL_DAY_RE = /\b((?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)(?:\s*[/,&]\s*(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?))*)\b/i;

function parseDays(daysStr: string): string[] {
  const normalized = daysStr.trim();

  // Try full day names first (Monday, Tuesday...)
  if (/monday|tuesday|wednesday|thursday|friday|saturday|sunday/i.test(normalized)) {
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
    // Only count commas between fields, not within names
    if ((line.match(/,/g) || []).length >= 2) commaCount++;
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
    else if (lower.includes('start') && lower.includes('time')) map.startTime = idx;
    else if (lower.includes('end') && lower.includes('time')) map.endTime = idx;
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

    // Single time value (might be start or end)
    if (!classData.start_time && SINGLE_TIME_RE.test(col) && col.match(/\d{1,2}:\d{2}/)) {
      classData.start_time = parseTime(col);
      continue;
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

    const courseCode = parseCourseCode(line);

    if (courseCode) {
      // Flush previous class
      if (currentClass?.course_code) {
        classes.push(fillDefaults(currentClass));
      }

      currentClass = { course_code: courseCode };

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

      // Course name fallback: if still missing, use a descriptive line
      if (!currentClass.course_name && line.length > 5 && !/^\d/.test(line) && !TIME_RANGE_RE.test(line)) {
        // Make sure it's not a day line or location-only line
        if (!(/^[MTWRF]{1,5}h?\s*$/i.test(line)) && !LOCATION_RE.test(line)) {
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
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const springMatch = text.match(/spring\s*(\d{4})?/i);
  const fallMatch = text.match(/fall\s*(\d{4})?/i);
  const summerMatch = text.match(/summer\s*(\d{4})?/i);
  const winterMatch = text.match(/winter\s*(\d{4})?/i);

  if (springMatch) return `Spring ${springMatch[1] || year}`;
  if (fallMatch) return `Fall ${fallMatch[1] || year}`;
  if (summerMatch) return `Summer ${summerMatch[1] || year}`;
  if (winterMatch) return `Winter ${winterMatch[1] || year}`;

  if (month >= 0 && month <= 4) return `Spring ${year}`;
  if (month >= 5 && month <= 7) return `Summer ${year}`;
  return `Fall ${year}`;
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
