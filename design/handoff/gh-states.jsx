(() => {
const { Icon, Button } = window.FairwayClubhouseEdition_9c4f4d;
const GH = window.GH;

/* Empty-state copy. Rules: one medallion icon, a title that names what belongs here,
   one or two sentences on how the space fills, one primary action (secondary optional). */
const EMPTY = {
  home: {
    coach: { icon: 'flag', title: 'Your season starts here', body: 'Add your players and your first event. Home fills in with RSVPs, recent rounds and CoachHelm signals as the team plays.', primary: ['Invite players', 'user-plus', 'Coach - Roster.html'], secondary: ['Add an event', 'calendar-plus', 'Coach - Calendar.html'] },
    player: { icon: 'flag', title: 'Welcome to the team', body: 'Post your first round to start your stats. Team updates and your schedule show up here too.', primary: ['Start a round', 'play', 'Player - Rounds.html'], secondary: ['Add classes', 'graduation-cap', 'Player - Classes.html'] },
  },
  coachhelm: {
    coach: { icon: 'sparkles', title: 'No signals yet', body: 'CoachHelm reads posted rounds. Each player’s insights appear once they’ve posted five rounds.', primary: ['View roster', 'users', 'Coach - Roster.html'] },
    player: { icon: 'sparkles', title: 'Post five rounds to unlock CoachHelm', body: 'CoachHelm needs five rounds to find patterns worth acting on. Every round you post sharpens the read.', progress: [2, 5, 'rounds posted'], primary: ['Start a round', 'play', 'Player - Rounds.html'] },
  },
  calendar: { any: { icon: 'calendar-days', title: 'Nothing on the calendar', body: 'Add practices, qualifiers and trips. Players see them on their calendar and can RSVP.', primary: ['Create event', 'plus'] } },
  hub: {
    coach: { icon: 'megaphone', title: 'Nothing posted yet', body: 'Post an announcement, plan a trip or share a document. Everything you post shows up in your players’ Team Hub.', primary: ['New announcement', 'megaphone'], secondary: ['Plan a trip', 'plane'] },
    player: { icon: 'users-round', title: 'No team updates yet', body: 'Announcements, trips and documents from your coaches will show up here.' },
  },
  messages: { any: { icon: 'message-square', title: 'No conversations yet', body: 'Start a thread with the whole team or message a player directly.', primary: ['New message', 'square-pen'] } },
  roster: { any: { icon: 'users', title: 'No players yet', body: 'Invite players by email or share your team code. They appear here as soon as they join.', primary: ['Invite players', 'user-plus'], secondary: ['Copy team code', 'copy'] } },
  stats: { any: { icon: 'chart-column', title: 'No stats yet', body: 'Team and player stats fill in as players post rounds.', primary: ['View roster', 'users', 'Coach - Roster.html'] } },
  qualifiers: { any: { icon: 'medal', title: 'No qualifiers yet', body: 'Set up a qualifier to rank players across counted rounds and pick your lineup.', primary: ['Create qualifier', 'plus'] } },
  rounds: { any: { icon: 'flag', title: 'No rounds yet', body: 'Track your first round shot by shot. Your scores, stats and CoachHelm insights build from there.', primary: ['Start a round', 'play'] } },
};

function GHEmpty({ page, role, mobile }) {
  if (page === 'classes' && window.ClassesPage) { const CP = window.ClassesPage; return <CP initial={{ empty: true }} />; }
  const set = EMPTY[page] || EMPTY.home;
  const e = set[role] || set.any || set.coach;
  const act = (a) => () => { if (a[2]) location.href = a[2]; };
  return (
    <section className={'gh-empty' + (mobile ? ' is-m' : '')} data-gh-empty={page}>
      <div className="gh-empty__in">
        <span className="gh-empty__art"><span className="gh-empty__ic"><Icon name={e.icon} size={mobile ? 24 : 26} /></span></span>
        <h2>{e.title}</h2>
        <p>{e.body}</p>
        {e.progress && <div className="gh-empty__prog"><span className="gh-empty__seg">{Array.from({ length: e.progress[1] }, (_, i) => <i key={i} className={i < e.progress[0] ? 'is-on' : ''}></i>)}</span><em>{e.progress[0]} of {e.progress[1]} {e.progress[2]}</em></div>}
        {(e.primary || e.secondary) && <div className="gh-empty__a">
          {e.primary && <Button variant="primary" leftIcon={e.primary[1]} onClick={act(e.primary)}>{e.primary[0]}</Button>}
          {e.secondary && <Button leftIcon={e.secondary[1]} onClick={act(e.secondary)}>{e.secondary[0]}</Button>}
        </div>}
      </div>
    </section>
  );
}

/* Skeletons mirror each screen's real grid so nothing jumps when content arrives. */
const K = ({ w = '100%', h = 12, r = 6, dark }) => <i className={'gh-sk' + (dark ? ' is-dark' : '')} style={{ width: w, height: h, borderRadius: r }}></i>;
const C = ({ h, dark, pad = 20, gap = 12, children }) => <div className={'gh-skc' + (dark ? ' is-dark' : '')} style={{ minHeight: h, padding: pad, gap }}>{children}</div>;
const WS = ['92%', '78%', '64%', '86%', '58%'];
const Lines = ({ n = 3, dark }) => Array.from({ length: n }, (_, i) => <K key={i} w={WS[i % 5]} dark={dark} />);
const Row = ({ av = 36 }) => <div className="gh-skrow"><K w={av} h={av} r={av / 2.6} /><span className="gh-skrow__t"><K w="46%" h={12} /><K w="72%" h={10} /></span><K w={44} h={12} /></div>;
const Focus = () => <C h={540} pad={32} gap={16}><div className="gh-skbar"><K w={140} h={11} /><span className="gh-sp"></span><K w={90} h={22} r={11} /></div><K w="84%" h={30} r={8} /><K w="56%" h={30} r={8} /><Lines n={2} /><C h={140}><K w={160} h={11} /><K h={10} r={5} /><K w="80%" h={10} r={5} /></C><C h={90} dark><K w={90} h={11} dark /><Lines n={2} dark /></C></C>;

function GHSkeleton({ page, role }) {
  let b;
  if (page === 'coachhelm' && role === 'coach') b = <><C h={150}><K w={110} h={11} /><div className="gh-sk2"><Row av={30} /><Row av={30} /><Row av={30} /><Row av={30} /></div></C><div className="gh-skg g-coach"><div className="gh-skcol">{[0, 1, 2, 3].map((i) => <Row key={i} av={34} />)}</div><Focus /></div></>;
  else if (page === 'coachhelm') b = <div className="gh-skg g-focus"><Focus /><div className="gh-skcol"><K w={120} h={11} />{[0, 1, 2].map((i) => <Row key={i} av={10} />)}</div></div>;
  else if (page === 'calendar') b = <><div className="gh-skbar"><K w={220} h={36} r={10} /><span className="gh-sp"></span><K w={120} h={36} r={10} /><K w={140} h={36} r={10} /></div><div className="gh-skcal">{Array.from({ length: 7 }, (_, i) => <div key={'h' + i} className="is-h"><K w={34} h={11} /></div>)}{Array.from({ length: 35 }, (_, i) => <div key={i}><K w={18} h={11} />{(i * 7) % 5 < 2 && <K w={60 + ((i * 13) % 30) + '%'} h={18} r={6} />}</div>)}</div></>;
  else if (page === 'messages') b = <div className="gh-skg g-split"><C h={560} pad={14} gap={4}><K h={36} r={10} />{Array.from({ length: 8 }, (_, i) => <Row key={i} av={40} />)}</C><C h={560}><Row av={36} /><div className="gh-skmsg">{[46, 58, 38, 52, 44, 30].map((w, i) => <span key={i} className={'gh-skb' + (i % 2 ? ' is-me' : '')}><K w={w + '%'} h={44} r={16} /></span>)}</div><K h={44} r={12} /></C></div>;
  else if (page === 'roster' || page === 'stats' || page === 'qualifiers') b = <><div className="gh-skbar"><K w={240} h={36} r={10} /><K w={120} h={36} r={10} /><K w={120} h={36} r={10} /></div><div className="gh-skc" style={{ padding: 0 }}><div className="gh-sktr is-h">{[90, 50, 50, 50, 50].map((w, i) => <K key={i} w={w} h={10} />)}</div>{Array.from({ length: 8 }, (_, i) => <div key={i} className="gh-sktr"><span className="gh-skrow" style={{ padding: 0 }}><K w={34} h={34} r={12} /><span className="gh-skrow__t"><K w="60%" h={12} /><K w="40%" h={10} /></span></span>{[0, 1, 2, 3].map((j) => <K key={j} w={40 + (((i + j) * 11) % 40) + '%'} h={12} />)}</div>)}</div></>;
  else if (page === 'rounds') b = <><div className="gh-sk5">{Array.from({ length: 5 }, (_, i) => <C key={i} h={96} gap={10}><K w={70} h={11} /><K w={64} h={28} r={8} /></C>)}</div><C h={420} pad={8} gap={0}>{Array.from({ length: 6 }, (_, i) => <div key={i} className="gh-sktr" style={{ gridTemplateColumns: '48px minmax(0,1fr) repeat(3,56px)' }}><K w={44} h={44} r={12} /><span className="gh-skrow__t"><K w="42%" h={13} /><K w="62%" h={10} /></span><K w={36} h={12} /><K w={36} h={12} /><K w={36} h={12} /></div>)}</C></>;
  else if (page === 'classes') b = <><C h={190} dark><K w={120} h={11} dark /><K w="46%" h={26} r={8} dark /><K h={10} r={5} dark /><div className="gh-sk3"><K h={40} r={10} dark /><K h={40} r={10} dark /><K h={40} r={10} dark /></div></C><div className="gh-skg g-cls"><div className="gh-sk2">{[0, 1, 2, 3].map((i) => <C key={i} h={210}><K w={90} h={22} r={7} /><K w="70%" h={14} /><K w="40%" h={11} /><span className="gh-sp"></span><K h={40} r={10} /></C>)}</div><C h={260}><K w={100} h={11} /><Lines n={4} /></C></div></>;
  else b = <div className="gh-skg g-dash"><div className="gh-skcol"><C h={280}><K w={120} h={11} /><K w="72%" h={28} r={8} /><Lines n={3} /></C><C h={200}><K w={100} h={11} /><Row /><Row /></C></div><div className="gh-skcol"><C h={230}><K w={90} h={11} /><Row av={28} /><Row av={28} /><Row av={28} /></C><C h={170}><K w={90} h={11} /><Lines n={3} /></C></div></div>;
  return (
    <div className="gh-skp" role="status" aria-label="Loading">
      <div className="gh-skhead"><K w={110} h={11} /><K w={280} h={36} r={10} /><K w={360} h={13} /></div>
      {page === 'hub' && <div className="gh-skbar">{[64, 110, 60, 86].map((w, i) => <K key={i} w={w} h={14} />)}</div>}
      {b}
    </div>
  );
}

function GHSkeletonM({ page }) {
  let b;
  if (page === 'messages') b = <><K h={38} r={12} />{Array.from({ length: 8 }, (_, i) => <Row key={i} av={44} />)}</>;
  else if (page === 'calendar') b = <><div className="gh-skdays">{Array.from({ length: 7 }, (_, i) => <K key={i} w={36} h={44} r={12} />)}</div>{Array.from({ length: 5 }, (_, i) => <C key={i} h={70} pad={14}><div className="gh-skrow" style={{ padding: 0 }}><K w={44} h={40} r={10} /><span className="gh-skrow__t"><K w="58%" h={12} /><K w="40%" h={10} /></span></div></C>)}</>;
  else if (page === 'rounds') b = <><div className="gh-sk3">{[0, 1, 2].map((i) => <C key={i} h={78} pad={12} gap={8}><K w={40} h={10} /><K w={48} h={22} r={7} /></C>)}</div><C h={300} pad={12} gap={0}>{Array.from({ length: 5 }, (_, i) => <Row key={i} av={40} />)}</C></>;
  else if (page === 'classes') b = <><C h={150} dark><K w={90} h={10} dark /><K w="60%" h={22} r={7} dark /><K h={9} r={5} dark /></C>{[0, 1, 2].map((i) => <C key={i} h={120}><K w={80} h={20} r={7} /><K w="70%" h={13} /><K w="40%" h={10} /></C>)}</>;
  else b = <><C h={176}><K w={100} h={10} /><K w="78%" h={22} r={7} /><Lines n={3} /></C><C h={220} pad={14} gap={0}>{Array.from({ length: 4 }, (_, i) => <Row key={i} av={36} />)}</C></>;
  return <div className="gh-skm" role="status" aria-label="Loading"><K w={90} h={11} /><K w={190} h={28} r={8} />{b}</div>;
}

/* Desktop: sits right after the top bar. Live renders nothing; loading/empty cover the content area below the top bar. */
function GHLayer({ page = GH.page, role = GH.role }) {
  const ref = React.useRef(null);
  const [s, setS] = React.useState(GH.state);
  const [leave, setLeave] = React.useState(false);
  const [box, setBox] = React.useState(null);
  React.useEffect(() => GH.onState((n) => {
    if (n === 'live') { setLeave(true); setTimeout(() => { setLeave(false); setS('live'); GH.reveal(ref.current); }, 260); }
    else { setLeave(false); setS(n); }
  }), []);
  React.useLayoutEffect(() => {
    const m = () => { const a = ref.current; if (!a || !a.parentElement) return; const c = a.parentElement.getBoundingClientRect(); const tb = a.previousElementSibling; const top = tb ? tb.getBoundingClientRect().bottom : c.top; setBox({ top: Math.max(0, top), left: c.left, width: c.width }); };
    m(); addEventListener('resize', m); return () => removeEventListener('resize', m);
  }, [s]);
  React.useEffect(() => { if (GH.state === 'live') GH.reveal(ref.current); }, []);
  return <><span className="gh-anchor" ref={ref} hidden></span>{s !== 'live' && box && ReactDOM.createPortal(<div className={'gh-layer' + (leave ? ' is-leaving' : '')} style={box} data-gh-state={s}>{s === 'empty' ? <GHEmpty page={page} role={role} /> : <GHSkeleton page={page} role={role} />}</div>, document.body)}</>;
}

/* Mobile: extra boards appended below each gallery — one phone per role and state. */
function GHPhone({ page, role, state, title, tab }) {
  const Top = window.MTop, Tabs = window.MTabs, Saf = window.MSafari;
  return <div className="qm fairway">{Top && <Top title={title} />}<div className="qm-scroll">{state === 'empty' ? <GHEmpty page={page} role={role} mobile /> : <GHSkeletonM page={page} />}</div>{Tabs && <Tabs on={tab} role={role} />}{Saf && <Saf />}</div>;
}
function GHBoards({ boards }) {
  const [pos, setPos] = React.useState(null);
  React.useEffect(() => {
    const t = setTimeout(() => {
      const els = Array.from(document.querySelectorAll('#root [data-screen-label]'));
      let max = 0; els.forEach((el) => { const b = (parseFloat(el.style.top) || el.offsetTop) + el.offsetHeight; if (b > max) max = b; });
      setPos({ top: max + 150, n: els.length });
    }, 400);
    return () => clearTimeout(t);
  }, []);
  if (!pos) return null;
  return (
    <div className="gh-boards">
      <div className="gh-row" style={{ top: pos.top - 80 }}>States: loading and empty<span>Skeleton and empty state for this screen, in the same shell.</span></div>
      {boards.map((b, i) => {
        const l = (b.role === 'player' ? 'Player' : 'Coach') + ' · ' + (b.state === 'empty' ? 'Empty state' : 'Loading');
        return <div key={i} className="qm-board" data-screen-label={String(pos.n + i + 1).padStart(2, '0') + ' ' + b.title + ' · ' + l} style={{ left: 60 + i * 482, top: pos.top }}><p className="qm-board__l">{l}</p><p className="qm-board__s">{b.state === 'empty' ? 'Nothing here yet' : 'Skeleton while data loads'}</p><IOSDevice><GHPhone {...b} /></IOSDevice></div>;
      })}
    </div>
  );
}
Object.assign(window, { GHLayer, GHBoards, GHEmpty, GHSkeleton, GHSkeletonM, GHPhone });
})();
