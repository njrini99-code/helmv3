'use client';

import { useEffect, useState } from 'react';
import { CalendarDays, MoreHorizontal, Search } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Badge } from '../ui/Badge';
import { Button, IconButton } from '../ui/Button';
import { FormLine } from '../ui/FormLine';
import { Icon } from '../ui/Icon';
import { Nine } from '../ui/Nine';
import { PhoneBar, PhoneIconAction, PhoneTextAction } from '../ui/PhoneBar';
import { RefreshNotice } from '../ui/RefreshNotice';
import { ScoreMark } from '../ui/ScoreMark';
import { ScrollRegion } from '../ui/ScrollRegion';
import { SectionBoundary } from '../ui/SectionBoundary';
import { EmptyState, Skeleton } from '../ui/States';
import { Checkbox } from '../ui/Checkbox';
import { Menu } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { InlineNotice } from '../ui/Notices';
import { SearchField } from '../ui/SearchField';
import { PillGroup, Segmented } from '../ui/Segmented';
import { Select } from '../ui/Select';
import { Slider } from '../ui/Slider';
import { Inset, Surface } from '../ui/Surface';
import { Switch } from '../ui/Switch';
import { useToast } from '../ui/Toast';
import { PLAYGROUND_CHANNEL, draftCSS, validDraft, type Draft } from './playground-tokens';

export function ComponentGallery() {
  const [draft, setDraft] = useState<Draft>({});
  const [stress, setStress] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('Pinehurst qualifier');
  const [search, setSearch] = useState('');
  const [checked, setChecked] = useState(true);
  const [selected, setSelected] = useState('team');
  const [range, setRange] = useState(50);
  const [motion, setMotion] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent || event.data?.channel !== PLAYGROUND_CHANNEL ||
        !validDraft(event.data.draft) || typeof event.data.stress !== 'boolean') return;
      setDraft(event.data.draft);
      setStress(event.data.stress);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ channel: PLAYGROUND_CHANNEL, ready: true }, location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
  const menu = <Menu label="Component actions" items={[{ label: 'View details' }, { label: 'Duplicate' }, { kind: 'separator' }, { label: 'Remove', danger: true }]}
    trigger={props => <button type="button" className="ch-btn" {...props}>Actions</button>} />;
  const title = stress ? 'PinehurstChampionshipInvitationalWithAnUnbrokenImportedCourseName' : 'Next qualifier';
  return <main className="ch-gallery" data-ready="true">
    <style>{draftCSS(draft)}</style>
    <header><h1>Shared components</h1><p>Interactive fixtures. No team data is saved.</p></header>
    <section className="ch-gallery__section" aria-labelledby="gallery-actions"><h2 id="gallery-actions">Actions and feedback</h2>
      <div className="ch-gallery__row"><Button variant="primary" onClick={() => toast({ title: 'Changes saved', body: 'Local preview only.' })}>Save changes</Button>
        <Button>Secondary</Button><Button variant="ink">Ink</Button><Button variant="ghost">Ghost</Button><Button variant="danger">Remove</Button></div>
      <div className="ch-gallery__row"><Button disabled>Disabled</Button><button type="button" className="ch-btn ch-btn--primary" disabled aria-busy="true">Saving changes</button>
        <Button onClick={() => toast({ title: 'Could not save', tone: 'error', body: 'Your changes are still here. Try again.' })}>Show error toast</Button></div>
          <div className="ch-gallery__row"><Button size="sm" leftIcon={Search}>Small action</Button><Button size="lg" rightIcon={CalendarDays}>Large action</Button>
        <IconButton icon={MoreHorizontal} label="Preview more actions" onClick={() => toast({ title: 'More actions', body: 'Local preview only.' })} />
        <IconButton icon={MoreHorizontal} label="Unavailable actions" disabled /></div>
    </section>
    <section className="ch-gallery__section" aria-labelledby="gallery-fields"><h2 id="gallery-fields">Fields and selection</h2>
      <label className="ch-gallery__field">Event name<input className="ch-input" value={name} onChange={event => setName(event.target.value)} /></label>
      <label className="ch-gallery__field">Unavailable field<input className="ch-input" disabled defaultValue="Pending permission" /></label>
      <label className="ch-gallery__field">Invalid field<input className="ch-input" aria-invalid="true" aria-describedby="gallery-validation" defaultValue="" /></label>
      <p id="gallery-validation">Enter an event name before continuing.</p>
      <SearchField label="Search players" placeholder="Search players" value={search} onChange={setSearch} />
      <Select label="View selection" value={selected} options={[{ value: 'team', label: 'Team' }, { value: 'player', label: 'Player' }]} onChange={setSelected} />
      <Segmented label="Result scope" value={selected} options={[{ value: 'team', label: 'Team' }, { value: 'player', label: 'Player' }]} onChange={setSelected} />
      <PillGroup label="Player scope" value={selected} options={[{ value: 'team', label: 'Team' }, { value: 'player', label: 'Player' }]} onChange={setSelected} />
      <Checkbox checked={checked} onChange={setChecked}>Include practice rounds</Checkbox>
      <Switch label="Round reminders" checked={checked} onChange={setChecked} />
      <Switch label="Updating preference" checked busy onChange={() => {}} />
      <Slider label="Practice goal" min={0} max={100} step={10} value={range} onChange={setRange} />
    </section>
    <section className="ch-gallery__section" aria-labelledby="gallery-surfaces"><h2 id="gallery-surfaces">Surfaces and states</h2>
      <Surface id="gallery-reading" title={title} subtitle="Thursday · Pinehurst No. 2" footerNote="5 of 6 players confirmed" actions={menu}>
        <p>Keep the next action clear and the supporting details easy to scan.</p><Inset>Player availability is still being confirmed.</Inset>
      </Surface>
      <Surface variant="flat" title="Flat section"><p>A quieter grouping for forms and supporting content.</p></Surface>
      <SectionBoundary surface="preview.component-gallery" label="Component preview"><InlineNotice title="Availability could not refresh" body="The last confirmed information is still shown." /></SectionBoundary>
      <RefreshNotice title="Preview refresh notice" body="Try again reloads this fixture; it does not write team data." code="preview-refresh" />
      <EmptyState title="No rounds yet" body="Posted rounds will appear here." icon={CalendarDays} compact />
      <EmptyState size="page" title="Start your practice history" body="Add a round when you are ready." icon={CalendarDays}
        progress={{ done: 1, total: 3, label: 'rounds posted' }} action={<Button onClick={() => setOpen(true)}>Preview round dialog</Button>} />
      <div aria-label="Loading geometry example" role="img" className="ch-gallery__skeleton"><Skeleton width="70%" height={20} /><Skeleton width="100%" /><Skeleton width="85%" /></div>
    </section>
    <section className="ch-gallery__section" aria-labelledby="gallery-overlays"><h2 id="gallery-overlays">Menus, dialogs and phone sheets</h2>
      <div className="ch-gallery__row"><Button onClick={() => setOpen(true)}>Open dialog or sheet</Button></div>
      <p>The shared Modal uses its real phone sheet below the shell breakpoint. Open Actions inside it to inspect nested menus.</p>
      <Modal open={open} onClose={() => setOpen(false)} title={title} description="Changes in this example stay local."
        footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></>}>
        {menu}{Array.from({ length: stress ? 16 : 2 }, (_, index) => <label className="ch-gallery__field" key={index}>
          Note {index + 1}<input className="ch-input" defaultValue={stress ? title : 'Practice round'} /></label>)}
      </Modal>
    </section>
    <section className="ch-gallery__section" aria-labelledby="gallery-data"><h2 id="gallery-data">Identity and golf data</h2>
      <div className="ch-gallery__row"><Avatar name="Jamie Rivera" /><span>Jamie Rivera</span><Avatar name="Taylor Kim" size={44} ring /><span>Taylor Kim</span><Icon icon={CalendarDays} /></div>
      <div className="ch-gallery__row"><Badge>Pending</Badge><Badge tone="accent">Selected</Badge><Badge tone="positive" dot>Confirmed</Badge><Badge tone="warning">Needs review</Badge><Badge tone="info">Updated</Badge></div>
      <div className="ch-gallery__row"><FormLine data={[76, 74, 75, 72]} label="Scores improved from 76 to 72 over four rounds" />
        <FormLine data={[74]} label="One round: early scoring read" /><FormLine data={[]} label="No scoring history" /></div>
      <div className="ch-gallery__row">{[2, 3, 4, 5, 6, null].map(score => <ScoreMark key={score ?? 'empty'} score={score} par={4} />)}</div>
      <ScrollRegion label="Example front nine scorecard"><Nine label="Out" caption="Example front nine: par and scores by hole"
        holes={Array.from({ length: 9 }, (_, index) => ({ n: index + 1, par: 4, score: index === 8 ? null : [4, 3, 5, 4, 2, 4, 6, 4][index] ?? 4 }))} /></ScrollRegion>
    </section>
    <section className="ch-gallery__section" aria-labelledby="gallery-phone"><h2 id="gallery-phone">Phone control parts</h2>
      <p>These are the real bar controls. Pushed-screen transitions and immersive shell behavior are covered in the page and popup previews.</p>
      <PhoneBar lead title="Preview detail" back={{ label: 'Components', onBack: () => toast({ title: 'Back action', body: 'This fixture stays open.' }) }}
        action={<PhoneIconAction icon={MoreHorizontal} label="Preview phone actions" onClick={() => setOpen(true)} />} />
      <div className="ch-gallery__row"><PhoneTextAction onClick={() => setOpen(true)}>Continue</PhoneTextAction><PhoneTextAction disabled onClick={() => {}}>Unavailable</PhoneTextAction><PhoneTextAction busy onClick={() => {}}>Saving</PhoneTextAction></div>
    </section>
    <section className="ch-gallery__section" aria-labelledby="gallery-motion"><h2 id="gallery-motion">Motion</h2>
      <Button onClick={() => setMotion(value => !value)}>Replay motion sample</Button>
      <div className="ch-gallery__motion" data-active={motion}>Shared CSS timing and easing</div>
      <p>Device reduced motion and Animations off remain respected. Visual tuning does not rewrite JavaScript motion constants.</p>
    </section>
  </main>;
}
