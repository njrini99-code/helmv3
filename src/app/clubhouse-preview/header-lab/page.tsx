import { notFound } from 'next/navigation';

const TONES = [
  { id: 'framed', name: 'Framed workspace', note: 'No plate. The title is part of the paper, closed by one rule; the green frame does the framing.' },
  { id: 'archival', name: 'Archival mat', note: 'A lighter mat with a fine brass inner line, set like a museum caption.' },
  { id: 'plaque', name: 'Clubhouse plaque', note: 'A mounted plate with a forest rule at the title.' },
  { id: 'scorecard', name: 'Scorecard', note: 'Ruled top and bottom like a club card; no plate.' },
  { id: 'topo', name: 'Engraved topographic', note: 'Framed, with a faint contour engraved in the far corner.' },
  { id: 'board', name: 'Tournament board', note: 'A thin forest rail, engraved capitals and the page’s numbers in the head.' },
] as const;

/** The header lab: the same Team stats page with each hero tone, side by side; each opens full screen. Dev only. */
export default function HeaderLab() {
  if (process.env.NODE_ENV === 'production') notFound();
  return (
    <main style={{ minHeight: '100vh', padding: '32px 32px 64px', background: '#0b3a25', color: '#f4eedd', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontFamily: 'Georgia, serif', fontWeight: 400, fontSize: 34 }}>Header lab · Team stats</h1>
      <p style={{ margin: '8px 0 24px', color: 'rgb(240 233 214 / 0.8)' }}>Same page, same sidebar and frame; only the hero changes. Open one to see it full screen.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))', gap: 24 }}>
        {TONES.map((t, i) => (
          <a key={t.id} href={`/clubhouse-preview/stats?tone=${t.id}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
            <div style={{ position: 'relative', aspectRatio: '1440 / 820', overflow: 'hidden', borderRadius: 12, containerType: 'inline-size', boxShadow: '0 0 0 1px rgb(176 149 96 / 0.5)' }}>
              <iframe
                title={t.name}
                src={`/clubhouse-preview/stats?tone=${t.id}`}
                style={{ position: 'absolute', top: 0, left: 0, width: 1440, height: 820, border: 0, transform: 'scale(var(--s))', transformOrigin: '0 0', pointerEvents: 'none', ['--s' as string]: 'calc(100cqw / 1440)' }}
                tabIndex={-1}
              />
            </div>
            <div style={{ marginTop: 10, fontFamily: 'Georgia, serif', fontSize: 20 }}>
              {i + 1} · {t.name}
            </div>
            <div style={{ fontSize: 13.5, color: 'rgb(240 233 214 / 0.75)' }}>{t.note}</div>
          </a>
        ))}
      </div>
    </main>
  );
}
