'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ComponentCatalog } from './ComponentCatalog';
import { clubhouseFontVariables } from '../lib/fonts';
import { Button } from '../ui/Button';
import { PLAYGROUND_CHANNEL, TUNERS, exportCSS, type Draft } from './playground-tokens';

export function ComponentPlayground() {
  const original = useRef<HTMLIFrameElement>(null);
  const candidate = useRef<HTMLIFrameElement>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [width, setWidth] = useState(390);
  const [height, setHeight] = useState(740);
  const [stress, setStress] = useState(false);
  const [compare, setCompare] = useState(true);
  const [status, setStatus] = useState('Changes stay in this playground.');
  const css = exportCSS(draft);
  const send = useCallback(() => {
    original.current?.contentWindow?.postMessage({ channel: PLAYGROUND_CHANNEL, draft: {}, stress }, location.origin);
    candidate.current?.contentWindow?.postMessage({ channel: PLAYGROUND_CHANNEL, draft, stress }, location.origin);
  }, [draft, stress]);
  useEffect(() => {
    send();
    const ready = (event: MessageEvent) => {
      if (event.origin === location.origin && event.data?.channel === PLAYGROUND_CHANNEL && event.data?.ready &&
        (event.source === original.current?.contentWindow || event.source === candidate.current?.contentWindow)) send();
    };
    window.addEventListener('message', ready);
    return () => window.removeEventListener('message', ready);
  }, [send, compare]);
  const download = () => {
    const url = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'clubhouse-design-proposal.css';
    link.click();
    URL.revokeObjectURL(url);
    setStatus('CSS proposal downloaded. Review it before applying.');
  };
  return <main className={`ch-root ch-playground ${clubhouseFontVariables}`} data-ui="clubhouse">
    <header className="ch-playground__header">
      <div><p className="ch-playground__eyebrow">Clubhouse design tools</p><h1>Component playground</h1>
        <p>Tune real components. Compare the result before changing the system.</p></div>
      <Button href="/clubhouse-preview/popup-lab">Popup diagnostics</Button>
    </header>
    <div className="ch-playground__layout">
      <aside className="ch-playground__controls" aria-label="Preview controls">
        <h2>Preview</h2>
        <label className="ch-playground__field">Viewport width
          <select className="ch-input" value={width} onChange={e => setWidth(Number(e.target.value))}>
            <option value={390}>Phone · 390px</option><option value={430}>Large phone · 430px</option>
            <option value={768}>Narrow · 768px</option><option value={1280}>Desktop · 1280px</option>
          </select></label>
        <label className="ch-playground__field">Viewport height
          <select className="ch-input" value={height} onChange={e => setHeight(Number(e.target.value))}>
            <option value={480}>Short · 480px</option><option value={740}>Standard · 740px</option><option value={932}>Tall · 932px</option>
          </select></label>
        <label><input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} /> Compare original</label>
        <label><input type="checkbox" checked={stress} onChange={e => setStress(e.target.checked)} /> Long text</label>
        <h2>Visual tuning</h2>
        <p>Untouched controls retain the live styles. Adjust a control to propose an override.</p>
        {TUNERS.map(tuner => <label className="ch-playground__field" key={tuner.key}>
          <span>{tuner.label} <output>{draft[tuner.key] === undefined ? 'Original' : `${draft[tuner.key]}${tuner.unit}`}</output></span>
          <input type="range" aria-label={tuner.label} min={tuner.min} max={tuner.max} value={draft[tuner.key] ?? tuner.initial}
            onChange={e => setDraft(previous => ({ ...previous, [tuner.key]: Number(e.target.value) }))} />
        </label>)}
        <Button onClick={() => { setDraft({}); setStatus('Original styles restored.'); }}>Reset tuning</Button>
        <p>Focus with Tab and hold a control to inspect its pressed state. Motion follows the device preference and Clubhouse settings.</p>
        <h2>Export proposal</h2>
        <Button variant="primary" onClick={download}>Download CSS</Button>
        <Button onClick={async () => {
          try { await navigator.clipboard.writeText(css); setStatus('CSS proposal copied.'); }
          catch { setStatus('Clipboard unavailable. Select the CSS below or download it.'); }
        }}>Copy CSS</Button>
        <p role="status">{status}</p>
        <label className="ch-playground__field">CSS proposal<textarea className="ch-input" readOnly value={css} rows={9} /></label>
      </aside>
      <section className="ch-playground__previews" aria-label="Component comparisons">
        {compare && <section className="ch-playground__pane"><h2>Original</h2><p>Current shared components · {width} × {height}</p>
          <div className="ch-playground__viewport"><iframe ref={original} title="Original Clubhouse components" src="/clubhouse-preview/components/gallery" width={width} height={height} onLoad={send} /></div></section>}
        <section className="ch-playground__pane"><h2>Candidate</h2><p>Local proposal · {width} × {height}</p>
          <div className="ch-playground__viewport"><iframe ref={candidate} title="Candidate Clubhouse components" src="/clubhouse-preview/components/gallery" width={width} height={height} onLoad={send} /></div></section>
      </section>
    </div>
    <ComponentCatalog />
  </main>;
}
