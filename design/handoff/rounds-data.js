(() => {
const IMG = 'assets/courses/';
const FINLEY = [[4,412],[5,538],[3,176],[4,395],[4,441],[3,204],[5,552],[4,368],[4,427],[4,402],[4,385],[3,188],[5,561],[4,432],[4,356],[3,167],[5,523],[4,457]];
const HOPE = [[4,388],[4,356],[3,162],[5,512],[4,401],[4,344],[3,191],[4,420],[4,372],[4,365],[3,178],[4,398],[5,505],[4,410],[3,155],[4,382],[4,415],[4,405]];
const GOV = [[4,398],[5,545],[4,410],[3,182],[4,376],[4,425],[3,166],[5,530],[4,404],[4,392],[4,418],[3,201],[5,556],[4,380],[4,433],[3,174],[5,512],[4,445]];
const mkTees = (base, sets) => {
  const baseTotal = base.reduce((s, h) => s + h[1], 0);
  return sets.map(([id, name, cat, total, rating, slope, hex]) => ({ id, name, cat, total, rating, slope, hex,
    holes: base.map(([par, y], i) => ({ n: i + 1, par, y: Math.round(y * total / baseTotal) })) }));
};
const courses = [
  { id: 'finley', name: 'Finley GC', city: 'Chapel Hill, NC', par: 72, img: IMG + 'aerial.webp', team: true, recent: 'Sep 26 · Blue',
    tees: mkTees(FINLEY, [['black','Black',"Men's",7412,75.4,139,'#1C1B18'],['blue','Blue',"Men's",6984,73.1,133,'#2F5E9E'],['white','White',"Men's",6461,70.8,127,'#FFFFFF'],['gold','Gold','Senior',5902,68.2,119,'#C9A227'],['red','Red',"Women's",5215,69.9,121,'#B03A2E']]) },
  { id: 'hope', name: 'Hope Valley CC', city: 'Durham, NC', par: 70, img: IMG + 'green-pond.webp', team: true, recent: 'Sep 12 · Blue',
    tees: mkTees(HOPE, [['black','Black',"Men's",6812,73.2,135,'#1C1B18'],['blue','Blue',"Men's",6359,71.0,129,'#2F5E9E'],['white','White',"Men's",5940,69.1,124,'#FFFFFF'],['red','Red',"Women's",5102,70.3,122,'#B03A2E']]) },
  { id: 'gov', name: 'Governors Club', city: 'Chapel Hill, NC', par: 72, img: IMG + 'sun-flare-fairway.webp', team: true, recent: null,
    tees: mkTees(GOV, [['black','Championship',"Men's",7110,74.6,140,'#1C1B18'],['blue','Blue',"Men's",6655,72.4,134,'#2F5E9E'],['white','White',"Men's",6120,69.9,126,'#FFFFFF']]) },
  { id: 'chatham', name: 'Old Chatham GC', city: 'Durham, NC', par: 72, img: IMG + 'links-bunker.webp', team: false, recent: 'Aug 30 · White',
    tees: mkTees(GOV, [['black','Black',"Men's",7338,76.1,142,'#1C1B18'],['white','White',"Men's",6402,71.2,130,'#FFFFFF']]) },
  { id: 'duke', name: 'Duke University GC', city: 'Durham, NC', par: 72, img: IMG + 'red-flag-green.webp', team: false, recent: null,
    tees: mkTees(FINLEY, [['blue','Blue',"Men's",7045,74.1,137,'#2F5E9E'],['white','White',"Men's",6428,71.3,129,'#FFFFFF'],['gold','Gold','Senior',5780,68.0,118,'#C9A227']]) },
  { id: 'poole', name: 'Lonnie Poole GC', city: 'Raleigh, NC', par: 71, img: IMG + 'bunker-palms.webp', team: false, recent: null,
    tees: mkTees(HOPE, [['blue','Blue',"Men's",6890,73.5,136,'#2F5E9E'],['white','White',"Men's",6211,70.2,125,'#FFFFFF']]) },
  { id: 'pine8', name: 'Pinehurst No. 8', city: 'Pinehurst, NC', par: 72, img: IMG + 'links-bunker.webp', team: false, recent: null,
    tees: mkTees(GOV, [['blue','Blue',"Men's",7092,74.5,137,'#2F5E9E'],['white','White',"Men's",6310,70.9,128,'#FFFFFF']]) },
  { id: 'treyburn', name: 'Treyburn CC', city: 'Durham, NC', par: 72, img: IMG + 'green-pond.webp', team: false, recent: null,
    tees: mkTees(FINLEY, [['black','Black',"Men's",7101,74.7,138,'#1C1B18'],['white','White',"Men's",6340,70.6,127,'#FFFFFF']]) },
];
const r = (d, dow, course, tee, type, score, par, putts, fir, gir, out) => ({ d, dow, course, tee, type, score, par, putts, fir, gir, out, inn: score - out });
const rounds = [
  { month: 'September 2026', items: [
    r('Sep 26','Fri','Finley GC','Blue','Qualifier',72,72,30,'9/14',12,35),
    r('Sep 22','Mon','Finley GC','Blue','Qualifier',76,72,33,'7/14',10,39),
    r('Sep 18','Thu','Hope Valley CC','Blue','Practice',71,70,29,'10/14',12,36),
    r('Sep 12','Sat','Hope Valley CC','Blue','Tournament',74,70,31,'8/14',11,37),
    r('Sep 5','Sat','Finley GC','Blue','Practice',75,72,32,'8/14',10,38) ] },
  { month: 'August 2026', items: [
    r('Aug 30','Sun','Old Chatham GC','White','Practice',73,72,31,'9/14',11,37),
    r('Aug 24','Mon','Finley GC','Blue','Practice',77,72,34,'6/14',9,38),
    r('Aug 18','Tue','Carolina GC','Blue','Qualifier',75,72,32,'8/14',10,37) ] },
];
const trend = [77, 75, 73, 75, 74, 71, 76, 72];
// Hole-by-hole for the in-progress round (Finley GC · Blue), holes 1–3 done.
const played = [4, 6, 3];
window.RND = { courses, rounds, trend, played,
  qualifier: { name: 'Pinehurst qualifier', round: 3, date: 'Today', course: 'finley', tee: 'blue', note: 'Play from the blue tees. Post within 24 hours of finishing.' },
  player: { first: 'Jonah', name: 'Jonah Okafor' } };
window.rndTp = (n) => n == null ? '—' : n === 0 ? 'E' : n > 0 ? '+' + n : '−' + Math.abs(n);
})();
