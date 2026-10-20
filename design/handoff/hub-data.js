window.HUB = {
  team: 'Varsity · Fall 2026',
  players: [['theo', 'Theo Marchetti'], ['sofia', 'Sofia Alvarez'], ['ava', 'Ava Lindqvist'], ['jonah', 'Jonah Okafor'], ['eli', 'Eli Brandt'], ['priya', 'Priya Natarajan']],
  notifs: [
    { id: 'n1', icon: 'megaphone', t: 'Coach Reyes posted', b: 'Pairings for Thursday are up', when: '12 min', unread: true, kind: 'ann' },
    { id: 'n2', icon: 'plane', t: 'Travel updated', b: 'Carolina Fall Invitational · hotel confirmed', when: '1 h', unread: true, kind: 'travel' },
    { id: 'n3', icon: 'square-check', t: 'Task due tomorrow', b: 'Sign travel waiver', when: '3 h', unread: true, kind: 'task' },
    { id: 'n4', icon: 'medal', t: 'Qualifier standings moved', b: 'You’re 4th · 2 shots inside the line', when: 'Yesterday', kind: 'q' },
    { id: 'n5', icon: 'file-text', t: 'New document', b: 'Local rules · Pinehurst No. 2', when: 'Yesterday', kind: 'doc' },
    { id: 'n6', icon: 'message-square', t: 'Sofia replied in Varsity team', b: '“See everyone at 6.”', when: 'Mon', kind: 'msg' },
  ],
  anns: [
    { id: 'a1', pin: true, by: 'Maya Reyes', role: 'Head coach', when: 'Today 2:28 PM', title: 'Pairings and tee times for Thursday', body: 'First group off at 8:42. Warm-up on the range from 7:30. Bring your yardage book and two dozen balls. Pairings PDF is in Documents.', ack: [5, 6], needAck: true, tags: ['Pinehurst'] },
    { id: 'a2', by: 'Dan Whitfield', role: 'Assistant coach', when: 'Yesterday', title: 'Short-game block moves to Green 2', body: 'Maintenance on the practice green through Friday. Same time, 3:30.', ack: [6, 6], tags: ['Practice'] },
    { id: 'a3', by: 'Maya Reyes', role: 'Head coach', when: 'Oct 9', title: 'Team dinner after the qualifier', body: 'Carolina Inn, 7:30 PM on Thursday. Parents welcome, RSVP by Wednesday.', ack: [4, 6], tags: ['Team'] },
  ],
  trips: [
    { id: 'cfi', name: 'Carolina Fall Invitational', course: 'Pine Needles', city: 'Southern Pines, NC', dates: 'Mon 3 – Wed 5 Nov', nights: 2, depart: 'Mon 12:00 PM', from: 'Finley lot', ret: 'Wed · evening', hotel: 'Mid Pines Inn', travelers: ['theo', 'sofia', 'ava', 'eli', 'priya'], status: 'confirmed', img: 'assets/courses/sun-flare-fairway.webp',
      plan: [['Mon 12:00', 'Bus leaves Finley lot', 'bus'], ['Mon 3:30', 'Practice round', 'flag'], ['Tue 8:10', 'Round 1', 'flag'], ['Wed 7:50', 'Round 2', 'flag'], ['Wed 5:00', 'Bus home', 'bus']] },
    { id: 'sea', name: 'Seahawk Intercollegiate', course: 'Country Club of Landfall', city: 'Wilmington, NC', dates: 'Nov 14 – 16', nights: 2, depart: 'Fri 11:00 AM', from: 'Finley lot', ret: 'Sun', hotel: 'Hotel Ballast', travelers: ['theo', 'sofia', 'ava', 'jonah', 'priya'], status: 'draft', img: 'assets/courses/green-pond.webp', plan: [] },
  ],
  tasks: [
    { id: 't1', t: 'Sign travel waiver', for: 'Carolina Fall Invitational', due: 'Fri 17', done: [3, 5] },
    { id: 't2', t: 'Post two practice rounds', for: 'Qualifier eligibility', due: 'Wed 15', done: [4, 6] },
    { id: 't3', t: 'Upload class schedule', for: 'Fall term', due: 'Done', done: [6, 6] },
  ],
  docs: [
    { f: 'Carolina Fall Invitational', items: [['Pairings and tee times', 'PDF', '84 KB', 'Today'], ['Hotel confirmation', 'PDF', '61 KB', 'Yesterday'], ['Travel waiver', 'PDF', '46 KB', 'Oct 10']] },
    { f: 'Team', items: [['Fall 2026 schedule', 'PDF', '120 KB', 'Aug 20'], ['Team handbook', 'PDF', '1.2 MB', 'Aug 18'], ['Practice plan · week 9', 'DOC', '32 KB', 'Oct 12']] },
    { f: 'Compliance', items: [['NCAA hours log', 'XLS', '58 KB', 'Oct 13'], ['Eligibility checklist', 'PDF', '90 KB', 'Aug 25']] },
  ],
};
