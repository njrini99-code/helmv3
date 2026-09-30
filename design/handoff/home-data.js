(function(){
  const pars=[4,4,3,4,4,3,4,5,4,4,4,3,5,4,4,3,4,5];
  const mk=(off)=>pars.map((par,i)=>({n:i+1,par,score:par+off[i]}));
  window.HOME_DATA = {
    coach: { name: 'Maya Reyes', meta: 'Head coach · Varsity' },
    players: [
      { id: 'theo', name: 'Theo Marchetti', year: 'Senior', avg: 70.9, sg: 1.8, trend: [72,71,71,70,70,71,70], status: 'positive', statusLabel: 'Improving' },
      { id: 'sofia', name: 'Sofia Alvarez', year: 'Senior', avg: 71.6, sg: 1.1, trend: [72,72,71,72,71,71,71], status: 'neutral', statusLabel: 'Steady' },
      { id: 'ava', name: 'Ava Lindqvist', year: 'Junior', avg: 72.4, sg: 0.6, trend: [73,74,72,72,72,73,72], status: 'neutral', statusLabel: 'Steady' },
      { id: 'jonah', name: 'Jonah Okafor', year: 'Sophomore', avg: 74.1, sg: -0.9, trend: [72,72,73,74,75,74,75], status: 'danger', statusLabel: 'Slipping' },
      { id: 'eli', name: 'Eli Brandt', year: 'Junior', avg: 74.8, sg: -0.4, trend: [74,75,74,75,75,74,75], status: 'warning', statusLabel: 'No rounds 9 days' },
      { id: 'priya', name: 'Priya Natarajan', year: 'Freshman', avg: 75.2, sg: -1.4, trend: [78,77,77,76,75,75,74], status: 'positive', statusLabel: 'Improving' }
    ],
    teamRounds: [['Aug 30',74.8],['Sep 6',74.6],['Sep 9',74.2],['Sep 13',74.4],['Sep 20',73.9],['Sep 23',73.8],['Sep 27',73.1],['Oct 4',73.5],['Oct 8',73.6],['Oct 12',73.4]].map(([label,score])=>({label,score})),
    rounds: [
      { player: 'Theo Marchetti', meta: 'Oakmont CC · Sun 12 Oct · Member tees', badge: null, stats: [{label:'GIR',value:'14/18'},{label:'Putts',value:'28'},{label:'SG',value:'+2.4'}], holes: mk([0,1,0,1,0,-1,0,0,0,-1,0,0,-1,0,1,0,0,-1]) },
      { player: 'Sofia Alvarez', meta: 'Oakmont CC · Sun 12 Oct · Member tees', stats: [{label:'GIR',value:'12/18'},{label:'Putts',value:'30'},{label:'SG',value:'+1.2'}], holes: mk([0,0,0,-1,1,0,0,0,0,0,1,0,-1,0,0,0,0,-1]) },
      { player: 'Jonah Okafor', meta: 'Pine Needles · Sat 11 Oct · Back tees', stats: [{label:'GIR',value:'8/18'},{label:'Putts',value:'31'},{label:'SG',value:'−1.6'}], holes: mk([1,0,0,1,0,0,2,0,1,0,0,1,0,1,0,0,1,-1]) }
    ]
  };
})();
