import React from 'react';

export function YardagePage({ title, meta, note, children, className = '', style }) {
  return (
    <section className={'fw-yb fw-yb-page ' + className} style={style}>
      {(title || meta) && (
        <header className="fw-yb-page__head">
          {title && <h3>{title}</h3>}
          {meta && <span className="fw-yb-page__meta">{meta}</span>}
        </header>
      )}
      {children}
      {note && <p className="fw-yb-note">{note}</p>}
    </section>
  );
}
