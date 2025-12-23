/**
 * Schedule Parser Utility
 * Parses class schedule text (from PDF or manual input) into structured data
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
}

// Common day patterns
const DAY_PATTERNS: Record<string, string[]> = {
  'MWF': ['M', 'W', 'F'],
  'MW': ['M', 'W'],
  'MF': ['M', 'F'],
  'WF': ['W', 'F'],
  'TTH': ['T', 'Th'],
  'TTh': ['T', 'Th'],
  'TR': ['T', 'Th'],
  'TUTH': ['T', 'Th'],
  'TuTh': ['T', 'Th'],
  'M': ['M'],
  'T': ['T'],
  'W': ['W'],
  'TH': ['Th'],
  'Th': ['Th'],
  'F': ['F'],
  'SA': ['Sa'],
  'Sa': ['Sa'],
  'SU': ['Su'],
  'Su': ['Su'],
  'MTWTHF': ['M', 'T', 'W', 'Th', 'F'],
  'MTWHF': ['M', 'T', 'W', 'Th', 'F'],
  'MTWRF': ['M', 'T', 'W', 'Th', 'F'],
};

// Generate unique ID
function generateId(): string {
  return `class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Parse days string into array
export function parseDays(daysStr: string): string[] {
  const normalized = daysStr.trim().toUpperCase().replace(/\s+/g, '');
  
  // Check for exact matches first
  for (const [pattern, days] of Object.entries(DAY_PATTERNS)) {
    if (normalized === pattern.toUpperCase()) {
      return days;
    }
  }
  
  // Try to parse individual days
  const days: string[] = [];
  let remaining = normalized;
  
  // Check for Thursday first (TH before T)
  if (remaining.includes('TH')) {
    days.push('Th');
    remaining = remaining.replace(/TH/g, '');
  }
  
  // Check remaining days
  if (remaining.includes('M')) days.push('M');
  if (remaining.includes('T')) days.push('T');
  if (remaining.includes('W')) days.push('W');
  if (remaining.includes('F')) days.push('F');
  if (remaining.includes('SA')) days.push('Sa');
  if (remaining.includes('SU')) days.push('Su');
  
  // Sort days in order
  const dayOrder = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
  return days.sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b));
}

// Parse time string to 24-hour format (HH:MM)
export function parseTime(timeStr: string): string {
  const cleaned = timeStr.trim().toUpperCase().replace(/\s+/g, '');
  
  // Match patterns like "9:30AM", "09:30 AM", "1:00PM", "13:00"
  const match = cleaned.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/i);

  if (!match || !match[1]) return '';

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const period = match[3]?.toUpperCase();
  
  // Convert to 24-hour format
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

// Parse time range (e.g., "9:30AM - 10:45AM")
export function parseTimeRange(rangeStr: string): { start: string; end: string } {
  const parts = rangeStr.split(/[-–—to]/i).map(s => s.trim());
  
  return {
    start: parts[0] ? parseTime(parts[0]) : '',
    end: parts[1] ? parseTime(parts[1]) : '',
  };
}

// Parse course code (e.g., "BUAD 123" or "BUAD123")
export function parseCourseCode(text: string): string {
  const match = text.match(/([A-Z]{2,5})\s*(\d{3,4}[A-Z]?)/i);
  return (match && match[1] && match[2]) ? `${match[1].toUpperCase()} ${match[2]}` : '';
}

// Parse location into building and room
export function parseLocation(location: string): { building: string; room: string } {
  const cleaned = location.trim();
  
  // Common patterns: "HAL 101", "Hall Building 101", "Room 305"
  const match = cleaned.match(/^([A-Za-z\s]+?)\s*(\d+[A-Za-z]?)$/);

  if (match && match[1] && match[2]) {
    return {
      building: match[1].trim(),
      room: match[2].trim(),
    };
  }
  
  return { building: cleaned, room: '' };
}

// Detect semester from text
export function detectSemester(text: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // Check for explicit semester mentions
  const springMatch = text.match(/spring\s*(\d{4})?/i);
  const fallMatch = text.match(/fall\s*(\d{4})?/i);
  const summerMatch = text.match(/summer\s*(\d{4})?/i);
  
  if (springMatch) return `Spring ${springMatch[1] || year}`;
  if (fallMatch) return `Fall ${fallMatch[1] || year}`;
  if (summerMatch) return `Summer ${summerMatch[1] || year}`;
  
  // Default based on current month
  if (month >= 0 && month <= 4) return `Spring ${year}`;
  if (month >= 5 && month <= 7) return `Summer ${year}`;
  return `Fall ${year}`;
}

// Main parser function for schedule text
export function parseScheduleText(text: string): ParsedClass[] {
  const classes: ParsedClass[] = [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const semester = detectSemester(text);
  
  let currentClass: Partial<ParsedClass> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Try to find course code
    const courseCode = parseCourseCode(line);
    
    if (courseCode) {
      // Save previous class if exists
      if (currentClass && currentClass.course_code) {
        classes.push({
          id: generateId(),
          course_code: currentClass.course_code || '',
          course_name: currentClass.course_name || '',
          instructor: currentClass.instructor || '',
          days: currentClass.days || [],
          start_time: currentClass.start_time || '',
          end_time: currentClass.end_time || '',
          location: currentClass.location || '',
          building: currentClass.building || '',
          room: currentClass.room || '',
          credits: currentClass.credits || null,
          semester,
        });
      }
      
      // Start new class
      currentClass = { course_code: courseCode };
      
      // Try to extract course name (text after course code)
      const codeIndex = line.search(/[A-Z]{2,5}\s*\d{3,4}/i);
      if (codeIndex !== -1) {
        const afterCode = line.substring(codeIndex + courseCode.replace(/\s/g, '').length);
        const nameMatch = afterCode.match(/[-–—|]?\s*([A-Za-z][A-Za-z\s&,]+?)(?=\s*[-–—|]|\s*[MTWThFSaSu]+|\s*\d{1,2}:|$)/);
        if (nameMatch && nameMatch[1]) {
          currentClass.course_name = nameMatch[1].trim();
        }
      }
      
      // Try to find days in same line
      const daysMatch = line.match(/\b(M?T?W?(Th)?F?|MWF|TTh|TR|MW)\b/);
      if (daysMatch && daysMatch[0] && daysMatch[0].length >= 1) {
        currentClass.days = parseDays(daysMatch[0]);
      }

      // Try to find time in same line
      const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(AM|PM)?)\s*[-–—to]+\s*(\d{1,2}:\d{2}\s*(AM|PM)?)/i);
      if (timeMatch && timeMatch[0]) {
        const times = parseTimeRange(timeMatch[0]);
        currentClass.start_time = times.start;
        currentClass.end_time = times.end;
      }

      // Try to find instructor
      const instrMatch = line.match(/(?:Prof\.?|Dr\.?|Professor|Instructor)[:\s]+([A-Za-z\s.]+?)(?=\s*[-–—|]|$)/i);
      if (instrMatch && instrMatch[1]) {
        currentClass.instructor = instrMatch[1].trim();
      }

      // Try to find credits
      const creditsMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:credits?|units?|hrs?|hours?)/i);
      if (creditsMatch && creditsMatch[1]) {
        currentClass.credits = parseFloat(creditsMatch[1]);
      }
    } else if (currentClass) {
      // Continue parsing details for current class
      
      // Days
      if (!currentClass.days || currentClass.days.length === 0) {
        const daysMatch = line.match(/\b(M?T?W?(Th)?F?|MWF|TTh|TR|MW)\b/);
        if (daysMatch && daysMatch[0] && daysMatch[0].length >= 1) {
          currentClass.days = parseDays(daysMatch[0]);
        }
      }

      // Time
      if (!currentClass.start_time) {
        const timeMatch = line.match(/(\d{1,2}:\d{2}\s*(AM|PM)?)\s*[-–—to]+\s*(\d{1,2}:\d{2}\s*(AM|PM)?)/i);
        if (timeMatch && timeMatch[0]) {
          const times = parseTimeRange(timeMatch[0]);
          currentClass.start_time = times.start;
          currentClass.end_time = times.end;
        }
      }

      // Instructor
      if (!currentClass.instructor) {
        const instrMatch = line.match(/(?:Prof\.?|Dr\.?|Professor|Instructor|Staff)[:\s]+([A-Za-z\s.]+?)(?=\s*[-–—|]|$)/i);
        if (instrMatch && instrMatch[1]) {
          currentClass.instructor = instrMatch[1].trim();
        }
      }

      // Location
      if (!currentClass.location) {
        const locMatch = line.match(/([A-Z]{2,4})\s*(\d{3,4}[A-Za-z]?)/);
        if (locMatch && locMatch[0]) {
          const loc = parseLocation(locMatch[0]);
          currentClass.location = locMatch[0];
          currentClass.building = loc.building;
          currentClass.room = loc.room;
        }
      }
      
      // Course name (if still missing)
      if (!currentClass.course_name && line.length > 5 && !line.match(/^\d/) && !line.match(/^[MTWThFSaSu]+$/)) {
        currentClass.course_name = line;
      }
    }
  }
  
  // Don't forget the last class
  if (currentClass && currentClass.course_code) {
    classes.push({
      id: generateId(),
      course_code: currentClass.course_code || '',
      course_name: currentClass.course_name || '',
      instructor: currentClass.instructor || '',
      days: currentClass.days || [],
      start_time: currentClass.start_time || '',
      end_time: currentClass.end_time || '',
      location: currentClass.location || '',
      building: currentClass.building || '',
      room: currentClass.room || '',
      credits: currentClass.credits || null,
      semester,
    });
  }
  
  return classes;
}

// Format time for display (e.g., "09:30" -> "9:30 AM")
export function formatTimeDisplay(time: string): string {
  if (!time) return '';

  const parts = time.split(':');
  if (parts.length < 2 || !parts[0] || !parts[1]) return time;

  const [hoursStr, minutes] = parts;
  let hours = parseInt(hoursStr, 10);
  const period = hours >= 12 ? 'PM' : 'AM';

  if (hours > 12) hours -= 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${period}`;
}

// Format days array for display (e.g., ['M', 'W', 'F'] -> "MWF")
export function formatDaysDisplay(days: string[]): string {
  return days.join('');
}

// Get day name from abbreviation
export function getDayName(abbrev: string): string {
  const names: Record<string, string> = {
    'Su': 'Sunday',
    'M': 'Monday',
    'T': 'Tuesday',
    'W': 'Wednesday',
    'Th': 'Thursday',
    'F': 'Friday',
    'Sa': 'Saturday',
  };
  return names[abbrev] || abbrev;
}

// Convert day abbreviation to day of week number (0 = Sunday)
export function dayToNumber(day: string): number {
  const map: Record<string, number> = {
    'Su': 0, 'M': 1, 'T': 2, 'W': 3, 'Th': 4, 'F': 5, 'Sa': 6
  };
  return map[day] ?? -1;
}

// Generate random color for class (for calendar)
export function generateClassColor(): string {
  const colors = [
    '#16A34A', // green
    '#2563EB', // blue
    '#DC2626', // red
    '#9333EA', // purple
    '#EA580C', // orange
    '#0891B2', // cyan
    '#4F46E5', // indigo
    '#DB2777', // pink
  ];
  const randomIndex = Math.floor(Math.random() * colors.length);
  return colors[randomIndex] || '#16A34A'; // Default to green if undefined
}
