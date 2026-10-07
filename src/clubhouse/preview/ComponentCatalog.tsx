'use client';

import { useState, type ReactNode } from 'react';
import catalog from './component-catalog.json';

/** Native summary stays keyboard-operable; closed inventories do not mount their tables. */
function CatalogDetails({ summary, children }: { summary: ReactNode; children: () => ReactNode }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{summary}</summary>
    {open ? children() : null}
  </details>;
}

export function ComponentCatalog() {
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');
  const groups = [...new Set(catalog.components.map(component => component.group))].sort();
  const components = catalog.components.filter(component => (group === 'all' || component.group === group) &&
    `${component.file} ${component.exports.join(' ')} ${component.styles.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="ch-catalog" aria-labelledby="component-catalog-title">
    <header><h2 id="component-catalog-title">Complete source inventory</h2>
      <p>{catalog.components.length} component modules · {catalog.styles.length} stylesheets · {catalog.previews.length} preview routes</p>
      <p>Every non-test Clubhouse TSX module and stylesheet is indexed. Source class/import matches suggest stylesheet relationships; they do not prove that every state was rendered or audited.</p></header>
    <div className="ch-catalog__filters">
      <label className="ch-playground__field">Search components or styles<input className="ch-input" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="ch-playground__field">Component family<select className="ch-input" value={group} onChange={event => setGroup(event.target.value)}>
        <option value="all">All families</option>{groups.map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>
    </div>
    <p role="status">{components.length} modules shown</p>
    <div className="ch-catalog__modules">{components.map(component => <CatalogDetails key={component.file} summary={<>{component.file.replace('src/clubhouse/', '')} · {component.fixture}</>}>{() => <>
      <p>Source: {component.file}</p>
      <p>Exported capitalized symbols: {component.exports.join(', ') || 'Provider or module-local rendering'}</p>
      <p>Direct gallery examples: {component.examples.join(', ') || 'None; use the contextual preview'}. This records fixture markup, not executed state coverage.</p>
      <p>Matched stylesheet declarations: {component.styles.join(', ') || 'Inherited/shared styles or no direct class match'}</p>
    </>}</CatalogDetails>)}</div>
    <CatalogDetails summary="All stylesheet owners and token declarations">{() => <>
      <p>Values below are source declarations, including overrides. Computed styles still depend on viewport, ancestry and component state.</p>
      {catalog.styles.map(style => <CatalogDetails key={style.file} summary={<>{style.file.replace('src/clubhouse/styles/', '')} · {style.classes.length} classes · {style.tokens.length} token declarations</>}>{() => <>
        <p>{style.classes.join(', ') || 'Token scope stylesheet'}</p>
        {style.tokens.length > 0 && <div className="ch-catalog__table"><table><caption>Token declarations in {style.file}</caption>
          <thead><tr><th scope="col">Token</th><th scope="col">Value</th><th scope="col">Scope</th></tr></thead>
          <tbody>{style.tokens.map((token, index) => <tr key={index}><th scope="row">{token.name}</th><td>{token.value}</td><td>{token.scope}</td></tr>)}</tbody>
        </table></div>}
      </>}</CatalogDetails>)}
    </>}</CatalogDetails>
    <CatalogDetails summary="Page and contextual component previews">{() => <>
      <p>Open existing fixtures to inspect route-specific charts, sheets, forms, auth and provider-dependent components. Each preview owns its documented state query parameters.</p>
      <div className="ch-catalog__links">{catalog.previews.map(preview => <a key={preview.href} href={preview.href} target="_blank" rel="noopener noreferrer">{preview.name} preview (new tab)</a>)}</div>
    </>}</CatalogDetails>
  </section>;
}
