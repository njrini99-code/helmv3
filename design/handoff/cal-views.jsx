(() => {
const { Icon, Button } = window.FairwayClubhouseEdition_9c4f4d;
const C = window.CAL;
const START = 6, END = 21, HH = 52;

function layout(evs) {
  const s = [...evs].sort((a, b) => a.start - b.start || b.end - a.end);
  const out = []; let cluster = [], cEnd = -1;
  const flush = () => { const lanes = []; cluster.forEach((e) => { let i = lanes.findIndex((end) => end <= e.start); if (i < 0) { i = lanes.length; lanes.push(0); } lanes[i] = e.end; e._lane = i; }); cluster.forEach((e) => { e._lanes = lanes.length; out.push(e); }); cluster = []; };
  s.forEach((e) => { if (e.start >= cEnd && cluster.length) flush(); cluster.push({ ...e }); cEnd = Math.max(cEnd, e.end); if (cluster.length === 1) cEnd = e.end; });
  if (cluster.length) flush();
  return out;
}

function EventBlock({ e, sel, onSelect }) {
  const top = (e.start - START) * HH, h = Math.max((e.end - e.start) * HH - 2, 20);
  const short = h < 40;
  const w = 100 / e._lanes;
  const isClass = e.type === 'class';
  const title = isClass ? C.person(e.owner).name.split(' ')[0] + ' · ' + e.title : e.title;
  return (
    <button className={'ev ev--' + e.type + (short ? ' ev--short' : '') + (sel ? ' is-sel' : '')} style={{ top, height: h, left: `calc(${w * e._lane}% + 3px)`, width: `calc(${w}% - ${e._lanes > 1 ? 4 : 6}px)`, right: 'auto' }}
      onClick={() => onSelect(e.id)} aria-label={title + ', ' + C.range(e)}>
      <span className="ev__t">{title}</span>
      <span className="ev__m fw-num">{short ? C.fmt(e.start, false) : C.range(e) + (h > 70 && e.location ? ' · ' + e.location : '')}</span>
      {e.conflict && !short && <span className="ev__warn"><Icon name="triangle-alert" size={10} /></span>}
    </button>
  );
}

function TimeGrid({ dates, filter, selId, onSelect, onDay }) {
  const hours = Array.from({ length: END - START }, (_, i) => START + i);
  const allDay = C.events.filter((e) => e.allDay && dates.includes(e.date) && filter(e));
  return (
    <div className="wk dp-sheet" style={{ '--cols': dates.length, '--hours': END - START, '--hh': HH + 'px' }}>
      <div className="wk__head">
        <div></div>
        <div className="wk__days">
          {dates.map((d) => (
            <button key={d} className={'wk__day' + (d === C.today ? ' is-today' : '')} onClick={() => onDay(d)}>
              <span className="wk__d">{C.dow(d)}</span><span className="wk__n">{d}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="wk__allday">
        <span>All day</span>
        {dates.map((d) => (
          <div key={d} style={{ minWidth: 0 }}>
            {allDay.filter((e) => e.date === d).map((e) => (
              <button key={e.id} className={'ev-bar ev--' + e.type + (selId === e.id ? ' is-sel' : '')} onClick={() => onSelect(e.id)}><Icon name={C.TYPES[e.type].icon} size={12} />{e.title}</button>
            ))}
          </div>
        ))}
      </div>
      <div className="wk__grid">
        <div className="wk__rail">{hours.map((h) => h > START && <span key={h} style={{ top: (h - START) * HH }}>{((h + 11) % 12) + 1} {h < 12 ? 'AM' : 'PM'}</span>)}</div>
        {dates.map((d) => {
          const evs = layout(C.events.filter((e) => !e.allDay && e.date === d && filter(e)));
          return (
            <div key={d} className={'wk__col' + (d === C.today ? ' is-today' : '')}>
              {evs.map((e) => <EventBlock key={e.id} e={e} sel={selId === e.id} onSelect={onSelect} />)}
              {d === C.today && <div className="wk__now" style={{ top: (C.nowH - START) * HH }} role="separator" aria-label="Now, 2:40 PM"><span className="wk__nowlbl">2:40</span></div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthView({ filter, selDate, onPick }) {
  const cells = [[28, 1], [29, 1], [30, 1], ...Array.from({ length: 31 }, (_, i) => [i + 1, 0]), [1, 2]];
  return (
    <div className="mo dp-sheet">
      <div className="mo__dow">{C.DOW.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="mo__grid">
        {cells.map(([n, out], i) => {
          const evs = out ? [] : C.events.filter((e) => e.date === n && e.type !== 'class' && filter(e)).sort((a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start));
          const shown = evs.slice(0, 3);
          return (
            <button key={i} className={'mo__cell' + (out ? ' is-out' : '') + (!out && n === C.today ? ' is-today' : '') + (!out && n === selDate ? ' is-sel' : '')} onClick={() => !out && onPick(n)}>
              <span className="mo__n">{n}</span>
              {shown.map((e) => {
                const major = e.type === 'qualifier' || e.type === 'tournament';
                return <span key={e.id} className={'mo__ev' + (major ? ' is-major' : '')}><i className={'dot-' + e.type}></i><span>{e.title}</span></span>;
              })}
              {evs.length > 3 && <span className="mo__more">{evs.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({ filter, selId, onSelect }) {
  const [early, setEarly] = React.useState(false);
  const days = [...new Set(C.events.filter(filter).map((e) => e.date))].sort((a, b) => a - b);
  const past = days.filter((d) => d < C.today), next = days.filter((d) => d >= C.today);
  const list = early ? days : next;
  const label = (d) => d === C.today ? 'Today' : d === C.today + 1 ? 'Tomorrow' : C.dow(d) + ' ' + d;
  return (
    <div className="ag">
      {past.length > 0 && <div><Button size="sm" variant="ghost" leftIcon={early ? 'chevron-up' : 'chevron-down'} onClick={() => setEarly(!early)}>{early ? 'Hide earlier days' : 'Show ' + past.length + ' earlier days'}</Button></div>}
      {list.map((d) => {
        const evs = C.events.filter((e) => e.date === d && filter(e)).sort((a, b) => (a.allDay ? -1 : a.start) - (b.allDay ? -1 : b.start));
        const rows = [];
        evs.forEach((e, i) => {
          if (d === C.today && !e.allDay && e.start > C.nowH && (i === 0 || evs[i - 1].allDay || evs[i - 1].start <= C.nowH)) rows.push(<div key="now" className="ag__now" role="separator" aria-label="Now, 2:40 PM"><span>Now · 2:40 PM</span></div>);
          rows.push(
            <button key={e.id} className={'ag__row' + (selId === e.id ? ' is-sel' : '') + (e.type === 'class' ? ' is-class' : '')} onClick={() => onSelect(e.id)}>
              <span className="ag__t">{e.allDay ? 'All day' : C.fmt(e.start)}{!e.allDay && <span>{C.fmt(e.end)}</span>}</span>
              <span className={'ag__dot dot-' + e.type}></span>
              <span style={{ minWidth: 0 }}><span className="ag__a" style={{ display: 'block' }}>{e.type === 'class' ? C.person(e.owner).name + ' · ' + e.title : e.title}</span><span className="ag__b">{C.TYPES[e.type].label}{e.location ? ' · ' + e.location : ''}</span></span>
              {e.conflict ? <span className="fw-badge fw-badge--warning"><Icon name="triangle-alert" size={11} />Overlap</span> : <span></span>}
            </button>
          );
        });
        const inDays = d - C.today;
        return (
          <section key={d} className="ag__day">
            <div className={'ag__when' + (d === C.today ? ' is-today' : '')}><b>{label(d)}</b><span>{d === C.today || d === C.today + 1 ? C.dow(d) + ', ' + d + ' October' : inDays > 0 && inDays < 7 ? 'In ' + inDays + ' days' : d + ' October'}</span></div>
            <div className="ag__list dp-sheet">{rows}</div>
          </section>
        );
      })}
    </div>
  );
}

Object.assign(window, { TimeGrid, MonthView, AgendaView });
})();
