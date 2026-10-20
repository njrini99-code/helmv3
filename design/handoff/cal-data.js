window.CAL = (function () {
  const people = [
    { id: 'theo', name: 'Theo Marchetti', year: 'Senior' },
    { id: 'sofia', name: 'Sofia Alvarez', year: 'Senior' },
    { id: 'ava', name: 'Ava Lindqvist', year: 'Junior' },
    { id: 'jonah', name: 'Jonah Okafor', year: 'Sophomore' },
    { id: 'eli', name: 'Eli Brandt', year: 'Junior' },
    { id: 'priya', name: 'Priya Natarajan', year: 'Freshman' },
  ];
  const all = people.map((p) => p.id);
  // October: the 1st falls on a Wednesday. Week in view: Sun 12 – Sat 18. Today: Tue 14, 2:40 PM.
  const events = [
    { id: 'e1', date: 12, start: 8, end: 12.5, type: 'tournament', title: 'Team round', location: 'Oakmont Country Club', people: all, rsvp: [6, 0, 0, 0] },
    { id: 'e2', date: 13, start: 6.5, end: 7.5, type: 'workout', title: 'Strength', location: 'Weight room', people: all, rsvp: [5, 1, 0, 0], recurring: 'Mon, Wed · weekly' },
    { id: 'e3', date: 13, start: 15.5, end: 17.5, type: 'practice', title: 'Range and wedges', location: 'Practice range', people: all, rsvp: [6, 0, 0, 0], recurring: 'Weekdays · weekly' },
    { id: 'c1', date: 14, start: 9, end: 10.25, type: 'class', title: 'STAT 201', owner: 'priya', location: 'Hanes Hall 120', instructor: 'Dr. L. Osei', pattern: 'Tue, Thu', semester: 'Fall 2026' },
    { id: 'c2', date: 14, start: 13, end: 14.25, type: 'class', title: 'ECON 101', owner: 'jonah', location: 'Gardner Hall 008', instructor: 'Prof. M. Hart', pattern: 'Tue, Thu', semester: 'Fall 2026' },
    { id: 'e4', date: 14, start: 15.5, end: 17, type: 'practice', title: 'Short-game block', location: 'Practice green', people: all, rsvp: [6, 0, 0, 0], recurring: 'Weekdays · weekly', notes: 'Bunker ladder, then up-and-down pairs. Bring 20 balls.' },
    { id: 'e5', date: 14, start: 16.75, end: 17.5, type: 'meeting', title: '1:1 with Jonah', location: 'Range bay 4', people: ['jonah'], rsvp: [1, 0, 0, 0], conflict: 'k1', notes: 'Approach from 125–150 yards. Bring launch monitor.' },
    { id: 'e6', date: 14, start: 17.5, end: 18.25, type: 'practice', title: 'Putting ladder', location: 'Green 2', people: ['priya', 'ava'], rsvp: [2, 0, 0, 0] },
    { id: 'e7', date: 14, start: 18.25, end: 18.75, type: 'meeting', title: 'Parent call', location: 'Phone · Natarajan family', people: [], rsvp: [0, 0, 0, 0] },
    { id: 'e8', date: 15, start: 6.5, end: 7.5, type: 'workout', title: 'Strength', location: 'Weight room', people: all, rsvp: [6, 0, 0, 0], recurring: 'Mon, Wed · weekly' },
    { id: 'c3', date: 15, start: 11, end: 12.25, type: 'class', title: 'BIOL 110', owner: 'eli', location: 'Wilson Hall 107', instructor: 'Dr. A. Ruiz', pattern: 'Mon, Wed', semester: 'Fall 2026' },
    { id: 'e9', date: 15, start: 13.5, end: 14.25, type: 'meeting', title: 'Travel briefing', location: 'Team room', people: all, rsvp: [5, 0, 0, 1] },
    { id: 'c4', date: 15, start: 15, end: 16.25, type: 'class', title: 'CHEM 102 lab', owner: 'eli', location: 'Kenan Labs 210', instructor: 'Dr. P. Chan', pattern: 'Wed', semester: 'Fall 2026' },
    { id: 'e10', date: 15, start: 15.5, end: 17.5, type: 'practice', title: 'Course prep · 9 holes', location: 'Finley GC', people: all, rsvp: [4, 1, 0, 1], conflict: 'k2' },
    { id: 'e11', date: 16, allDay: true, type: 'qualifier', title: 'Qualifier · Pinehurst No. 2', location: 'Pinehurst, NC', people: all, rsvp: [5, 0, 0, 1], files: [['Pairings and tee times', 'PDF · 84 KB'], ['Local rules', 'PDF · 212 KB'], ['Hotel confirmation', 'PDF · 61 KB']] },
    { id: 'e12', date: 16, start: 6.25, end: 8, type: 'travel', title: 'Bus to Pinehurst', location: 'Leaves Finley lot', people: all, rsvp: [5, 0, 0, 1] },
    { id: 'e13', date: 17, start: 13, end: 14, type: 'meeting', title: 'Round review', location: 'Team room', people: all, rsvp: [0, 0, 0, 6] },
    { id: 'e14', date: 17, start: 15.5, end: 17, type: 'practice', title: 'Recovery nine', location: 'Finley GC', people: all, rsvp: [3, 2, 0, 1] },
    { id: 'e15', date: 20, start: 15.5, end: 17.5, type: 'practice', title: 'Range and wedges', location: 'Practice range', people: all, rsvp: [0, 0, 0, 6] },
    { id: 'e16', date: 22, start: 15.5, end: 17.5, type: 'practice', title: 'Course prep', location: 'Finley GC', people: all, rsvp: [0, 0, 0, 6] },
    { id: 'e17', date: 25, start: 7, end: 17, type: 'tournament', title: 'Tar Heel Invitational · R1', location: 'Finley GC', people: all, rsvp: [0, 0, 0, 6] },
    { id: 'e18', date: 26, start: 7, end: 17, type: 'tournament', title: 'Tar Heel Invitational · R2', location: 'Finley GC', people: all, rsvp: [0, 0, 0, 6] },
    { id: 'e19', date: 7, start: 15.5, end: 17.5, type: 'practice', title: 'Range and wedges', location: 'Practice range', people: all, rsvp: [6, 0, 0, 0] },
    { id: 'e20', date: 9, start: 13, end: 14, type: 'meeting', title: 'Lineup meeting', location: 'Team room', people: all, rsvp: [6, 0, 0, 0] },
    { id: 'e21', date: 3, start: 7, end: 17, type: 'tournament', title: 'Wolfpack Classic', location: 'Lonnie Poole GC', people: all, rsvp: [6, 0, 0, 0] },
    { id: 'e22', date: 29, start: 13, end: 14, type: 'meeting', title: 'Fall review', location: 'Team room', people: all, rsvp: [0, 0, 0, 6] },
  ];
  const conflicts = {
    k1: { id: 'k1', event: 'e5', who: 'jonah', with: 'e4', overlap: [16.75, 17], text: 'Jonah is invited to the short-game block, which runs until 5:00.', suggestions: [[17, 17.75], [18.25, 19]] },
    k2: { id: 'k2', event: 'e10', who: 'eli', with: 'c4', overlap: [15.5, 16.25], text: 'Eli has CHEM 102 lab until 4:15. He would miss the first 45 minutes.', suggestions: [[16.5, 18.5], [14.25, 16.25]] },
  };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dow = (d) => DOW[(d + 2) % 7]; // Oct 1 = Wed
  const TYPES = {
    practice: { label: 'Practice', icon: 'flag' },
    qualifier: { label: 'Qualifier', icon: 'target' },
    tournament: { label: 'Tournament', icon: 'trophy' },
    workout: { label: 'Workout', icon: 'dumbbell' },
    meeting: { label: 'Meeting', icon: 'users' },
    travel: { label: 'Travel', icon: 'bus' },
    class: { label: 'Class', icon: 'book-open' },
  };
  const fmt = (h, mer = true) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); const h12 = ((hh + 11) % 12) + 1; return h12 + ':' + String(mm).padStart(2, '0') + (mer ? (hh < 12 ? ' AM' : ' PM') : ''); };
  const range = (e) => e.allDay ? 'All day' : fmt(e.start, false) + ' – ' + fmt(e.end);
  const person = (id) => people.find((p) => p.id === id);
  return { people, events, conflicts, dow, DOW, TYPES, fmt, range, person, today: 14, nowH: 14.67 };
})();
