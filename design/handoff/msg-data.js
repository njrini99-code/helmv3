window.MSG = (function () {
  const me = { id: 'me', name: 'Maya Reyes' };
  const U = { theo: 'Theo Marchetti', sofia: 'Sofia Alvarez', ava: 'Ava Lindqvist', jonah: 'Jonah Okafor', eli: 'Eli Brandt', priya: 'Priya Natarajan', dan: 'Dan Whitfield' };
  const convs = [
    { id: 'team', group: true, title: 'Varsity team', members: ['me', 'dan', 'theo', 'sofia', 'ava', 'jonah', 'eli', 'priya'], unread: 3, time: '2:31 PM', section: 'today', preview: ['Ava', 'Does the bus leave from Finley or the field house?'] },
    { id: 'jonah', title: U.jonah, sub: 'Sophomore · Class of 2029', unread: 1, time: '1:58 PM', section: 'today', preview: ['', 'Can we push to 5? I have ECON until 2:15 and then a TA meeting.'] },
    { id: 'travel', group: true, title: 'Pinehurst travel', members: ['me', 'dan', 'theo', 'sofia', 'ava', 'jonah', 'eli', 'priya'], unread: 0, time: '11:04 AM', section: 'today', preview: ['You', 'Room list is pinned. Two to a room, same as Wolfpack.'] },
    { id: 'dan', title: U.dan, sub: 'Assistant coach', unread: 0, time: '9:20 AM', section: 'today', preview: ['Dan', 'I can run the short-game block if you take Jonah.'] },
    { id: 'eli', title: U.eli, sub: 'Junior · Class of 2028', unread: 0, time: 'Yesterday', section: 'week', preview: ['You', 'You need two posted rounds before Thursday.'] },
    { id: 'priya', title: U.priya, sub: 'Freshman · Class of 2030', unread: 0, time: 'Yesterday', section: 'week', preview: ['Priya', 'Thank you coach. I will be at the ladder.'] },
    { id: 'theo', title: U.theo, sub: 'Senior · Class of 2027', unread: 0, time: 'Sat', section: 'week', preview: ['Theo', 'Sent you the Arccos export from Oakmont.'] },
    { id: 'sofia', title: U.sofia, sub: 'Senior · Class of 2027', unread: 0, time: 'Oct 8', section: 'earlier', preview: ['You', 'Good round. Keep the same pre-shot on 16.'] },
  ];
  const threads = {
    team: [
      { day: 'Yesterday' },
      { from: 'me', t: '6:12 PM', text: 'Pairings for Thursday are posted in Documents. First tee 8:42.' },
      { from: 'me', t: '6:13 PM', text: 'Bus leaves at 6:15 sharp. Breakfast on the bus.', react: [['thumbs-up', 5]] },
      { from: 'theo', t: '6:20 PM', text: 'Are we walking or carts for the practice round?' },
      { from: 'dan', t: '6:24 PM', text: 'Walking. Push carts are in the cage, one per player.' },
      { day: 'Today' },
      { from: 'priya', t: '1:40 PM', text: 'Is the putting ladder still on at 5:30?' },
      { from: 'me', t: '1:52 PM', text: 'Yes. Green 2, bring three balls and a tee for the gate drill.' },
      { from: 'sofia', t: '2:18 PM', text: 'Can I get a ride back Friday? My parents are driving to the second round.', file: null },
      { from: 'ava', t: '2:31 PM', text: 'Does the bus leave from Finley or the field house?' },
    ],
    jonah: [
      { day: 'Today' },
      { from: 'me', t: '12:30 PM', text: 'Let\u2019s do a 1:1 at 4:45 in bay 4. We\u2019ll work 125 to 150 with the launch monitor.' },
      { from: 'me', t: '12:31 PM', card: { title: '1:1 with Jonah', meta: 'Today · 4:45 – 5:30 PM · Range bay 4' } },
      { from: 'jonah', t: '1:58 PM', text: 'Can we push to 5? I have ECON until 2:15 and then a TA meeting.' },
    ],
    travel: [
      { day: 'Today' },
      { from: 'me', t: '11:02 AM', file: { name: 'Room list · Pinehurst.pdf', meta: 'PDF · 48 KB' } },
      { from: 'me', t: '11:04 AM', text: 'Room list is pinned. Two to a room, same as Wolfpack.', react: [['thumbs-up', 6], ['check', 2]] },
    ],
    dan: [{ day: 'Today' }, { from: 'dan', t: '9:20 AM', text: 'I can run the short-game block if you take Jonah.' }],
    eli: [{ day: 'Yesterday' }, { from: 'me', t: '4:10 PM', text: 'You need two posted rounds before Thursday.' }],
    priya: [{ day: 'Yesterday' }, { from: 'priya', t: '7:44 PM', text: 'Thank you coach. I will be at the ladder.' }],
    theo: [{ day: 'Saturday' }, { from: 'theo', t: '5:02 PM', text: 'Sent you the Arccos export from Oakmont.' }],
    sofia: [{ day: 'Oct 8' }, { from: 'me', t: '8:15 PM', text: 'Good round. Keep the same pre-shot on 16.' }],
  };
  const name = (id) => (id === 'me' ? 'You' : U[id]);
  return { me, U, convs, threads, name };
})();
