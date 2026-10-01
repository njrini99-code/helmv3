(() => {
const PAR = [4,5,3,4,4,3,4,5,4, 4,4,3,5,4,4,3,4,5];
function card(seed, toPar) {
  let s = seed; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const d = PAR.map(() => 0); let left = toPar, g = 0;
  while (left !== 0 && g++ < 400) { const i = Math.floor(rnd() * 18), st = left > 0 ? 1 : -1; if (Math.abs(d[i] + st) <= (st > 0 ? 2 : 1)) { d[i] += st; left -= st; } }
  for (let k = 0; k < 3; k++) { const a = Math.floor(rnd() * 18), b = Math.floor(rnd() * 18); if (a !== b && d[a] < 1 && d[b] > -1) { d[a]++; d[b]--; } }
  return PAR.map((p, i) => ({ par: p, score: p + d[i] }));
}
const P = { sofia: 'Sofia Alvarez', theo: 'Theo Marchetti', jonah: 'Jonah Okafor', ava: 'Ava Lindqvist', eli: 'Eli Brandt', priya: 'Priya Natarajan', luca: 'Luca Ferraro', mia: 'Mia Thornton' };
const YR = { sofia: 'Senior', theo: 'Senior', jonah: 'Sophomore', ava: 'Junior', eli: 'Junior', priya: 'Freshman', luca: 'Freshman', mia: 'Junior' };
const e = (id, rounds) => ({ id, name: P[id], year: YR[id], rounds: rounds.map((r, i) => r == null ? null : { toPar: r, holes: card(id.length * 31 + i * 7 + 3, r) }) });
window.QUAL = {
  PLAYERS: Object.keys(P).map((id) => ({ id, name: P[id], year: YR[id], active: id !== 'mia' })),
  qualifiers: [
    { id: 'pinehurst', name: 'Pinehurst qualifier', status: 'in_progress', description: 'Three 18-hole rounds counting toward a cumulative total. The top four make the Pinehurst trip on score.',
      start: 'Sep 22, 2026', end: 'Oct 1, 2026', deadline: 'Sep 21, 2026', course: 'Finley GC', par: 72, numRounds: 3, spots: 5, picks: 1,
      rules: 'Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff.',
      roundCourses: [['Finley GC', 'Sep 22'], ['Finley GC', 'Sep 26'], ['Hope Valley CC', 'Oct 1']],
      entries: [e('sofia', [-1, -2]), e('theo', [1, -1]), e('jonah', [4, 0]), e('ava', [2, 3]), e('eli', [6, 1]), e('priya', [3, 7]), e('luca', [8]), e('mia', [])] },
    { id: 'conf', name: 'Conference qualifier', status: 'upcoming', description: 'Three rounds at Hope Valley. Top four qualify on score, one coach’s pick.',
      start: 'Oct 19, 2026', end: 'Oct 23, 2026', deadline: 'Oct 16, 2026', course: 'Hope Valley CC', par: 71, numRounds: 3, spots: 5, picks: 1,
      rules: 'Lowest aggregate over all rounds. Ties broken by final-round scorecard playoff.', roundCourses: [['Hope Valley CC', 'Oct 19'], ['Hope Valley CC', 'Oct 21'], ['Hope Valley CC', 'Oct 23']],
      entries: ['sofia', 'theo', 'jonah', 'ava', 'eli', 'priya', 'luca'].map((id) => e(id, [])) },
    { id: 'fall', name: 'Fall invitational qualifier', status: 'completed', description: 'Two rounds at Finley. Both count.', start: 'Sep 1, 2026', end: 'Sep 4, 2026', deadline: 'Aug 31, 2026', course: 'Finley GC', par: 72, numRounds: 2, spots: 5, picks: 1,
      rules: 'Lowest aggregate over both rounds.', roundCourses: [['Finley GC', 'Sep 1'], ['Finley GC', 'Sep 4']], confirmed: ['theo', 'sofia', 'ava', 'jonah', 'eli'], pick: { id: 'eli', why: 'Two top-10s last spring at Pine Needles, the invitational course.' },
      entries: [e('theo', [-2, 0]), e('sofia', [1, 1]), e('ava', [2, 3]), e('jonah', [3, 3]), e('mia', [4, 3]), e('eli', [5, 3]), e('priya', [6, 5])] },
    { id: 'summer', name: 'Preseason qualifier', status: 'completed', description: 'One round to set the first travel squad.', start: 'Aug 22, 2026', end: 'Aug 22, 2026', deadline: 'Aug 20, 2026', course: 'Finley GC', par: 72, numRounds: 1, spots: 5, picks: 0,
      rules: 'Single 18-hole round.', roundCourses: [['Finley GC', 'Aug 22']], entries: [e('sofia', [0]), e('theo', [1]), e('ava', [3]), e('jonah', [4]), e('mia', [4]), e('eli', [6])] },
    { id: 'spring', name: 'Spring conference qualifier', status: 'completed', description: 'Three rounds at Hope Valley.', start: 'Apr 6, 2026', end: 'Apr 10, 2026', deadline: 'Apr 3, 2026', course: 'Hope Valley CC', par: 71, numRounds: 3, spots: 5, picks: 1,
      rules: 'Lowest aggregate over all rounds.', roundCourses: [['Hope Valley CC', 'Apr 6'], ['Hope Valley CC', 'Apr 8'], ['Hope Valley CC', 'Apr 10']], entries: [e('theo', [0, 1, -1]), e('sofia', [2, 0, 1]), e('mia', [3, 2, 2]), e('ava', [4, 3, 1]), e('eli', [5, 4, 3])] },
  ],
};
})();
