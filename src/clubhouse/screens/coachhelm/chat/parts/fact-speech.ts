const CLOCK = /^(\d{1,2}):(\d{2})$/;

/** 16:00 → 4:00 PM. An unreadable time is returned unchanged. */
export function speakClock(time: string): string {
  const match = CLOCK.exec(time.trim());
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return time;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** 16:00 to 16:30 → 4:00 to 4:30 PM. The period is said once when both ends share it. */
export function speakSpan(start: string, end: string): string {
  const from = speakClock(start);
  const to = speakClock(end);
  const period = (spoken: string) => (spoken.endsWith(' AM') ? ' AM' : spoken.endsWith(' PM') ? ' PM' : '');
  return period(from) && period(from) === period(to) ? `${from.slice(0, -3)} to ${to}` : `${from} to ${to}`;
}

/**
 * The line the coach reads. Stored facts stay machine values (`2026-11-13, 16:00 to 16:30`);
 * the date tile already says the day, so the When line is only the clock.
 */
const EVENT_TYPE: Record<string, string> = {
  practice: 'Practice',
  tournament: 'Tournament',
  qualifier: 'Qualifier',
  meeting: 'Meeting',
  travel: 'Travel',
  other: 'Other',
};

/** The quiet line under a calendar confirm: who is invited, and whether replies are asked. */
export function calendarNote(invited: string | undefined, replies: string | undefined): string {
  const who = speakFact('Invited', invited ?? 'Not set', true);
  const people = who === 'Nobody' ? 'Nobody invited' : who;
  const reply = replies === 'Not asked for' ? 'No RSVP' : replies === 'Asked for' ? 'RSVP on' : replies;
  return reply ? `${people} · ${reply}` : people;
}

const URGENCY: Record<string, string> = {
  low: 'Low · it can wait',
  normal: 'Normal · it pushes when they are free',
  high: 'High · it pushes soon',
  urgent: 'Urgent · it pushes right away, even in class',
};

/** 2026-11-20 07:00 → Nov 20, 7:00 AM. */
function speakDay(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:[,\s]+(.+))?$/.exec(value.trim());
  if (!match) return speakFact('', value, false);
  const day = new Date(`${match[1]}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const rest = match[2]?.trim();
  if (!rest || /^all day$/i.test(rest)) return day;
  const times = /^(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})$/.exec(rest);
  const clock = times ? speakSpan(times[1], times[2]) : /[AP]M/i.test(rest) ? rest.replace(/\b0(\d:)/g, '$1') : speakFact('', rest, false);
  return `${day}, ${clock}`;
}

/** One line a coach can read. No field name beside it. */
export function spokenLine(label: string, value: string, dateOnTile = false): string {
  if (label === 'Urgency') return URGENCY[value.trim().toLowerCase()] ?? speakFact(label, value, dateOnTile);
  if (label === 'Acknowledgement') return /not required/i.test(value) ? 'No Got it' : 'Asks for Got it';
  if (label === 'To') {
    const count = value.match(/\((\d+)\)/)?.[1];
    if (/^everyone\b/i.test(value) && count) return `To ${count} ${count === '1' ? 'player' : 'players'}`;
    return `To ${value}`;
  }
  if (label === 'How') {
    const how = value.trim().toLowerCase();
    if (how === 'bus') return 'By bus';
    if (how === 'van') return 'By van';
    if (how === 'flight') return 'By plane';
    if (how === 'carpool') return 'By carpool';
  }
  if (label === 'Status') return value.length ? value[0]!.toUpperCase() + value.slice(1) : value;
  if (label === 'Rounds') return `${value} ${value === '1' ? 'round' : 'rounds'}`;
  if (label === 'Squad') {
    const squad = /^(\d+),\s*coach picks (\d+)$/.exec(value);
    if (squad) return `Squad of ${squad[1]}, ${squad[2]} coach ${squad[2] === '1' ? 'pick' : 'picks'}`;
  }
  if (label === 'Leaves') return `Leaves ${speakDay(value)}`;
  if (label === 'Back') return value.trim() && value !== 'Not set' ? `Back ${speakDay(value)}` : 'No return set';
  if (label === 'Starts') return `Starts ${speakDay(value)}`;
  if (label === 'From') return `From ${value}`;
  return speakFact(label, value, dateOnTile);
}

/** The sentence under the buttons. Announcements say who hears, not "notified in-app". */
export function confirmSentence(tool: string, notifications: readonly string[]): string {
  if (tool === 'create_team_announcement' || tool === 'create_announcement') {
    const count = notifications.join(' ').match(/\d+/)?.[0];
    const got = notifications.some((line) => /acknowledge/i.test(line));
    const who = count ? `${count} ${count === '1' ? 'player' : 'players'}` : 'the team';
    return `It posts to ${who} once Undo closes. ${got ? 'They tap Got it.' : 'No Got it.'}`;
  }
  if (!notifications.length) return 'Nothing is sent.';
  return notifications.join(' ');
}

export function speakFact(label: string, value: string, dateOnTile: boolean): string {
  if (label === 'Type') return EVENT_TYPE[value] ?? (value.length ? value[0]!.toUpperCase() + value.slice(1) : value);
  if (label === 'Invited' && value === 'Not set') return 'Nobody';
  const dated = /^(\d{4}-\d{2}-\d{2})(?:,\s*(.+))?$/.exec(value);
  if (label === 'When' && dated) {
    const rest = dated[2];
    if (!rest || /^all day$/i.test(rest)) return dateOnTile ? 'All day' : value;
    const times = /^(\d{1,2}:\d{2})\s+to\s+(\d{1,2}:\d{2})$/.exec(rest);
    if (times) return dateOnTile ? speakSpan(times[1], times[2]) : `${dated[1]}, ${speakSpan(times[1], times[2])}`;
  }
  return value.replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, (time) => speakClock(time));
}
