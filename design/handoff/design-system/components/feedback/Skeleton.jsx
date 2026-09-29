import React from 'react';

export function Skeleton({ width = '100%', height = 14, radius = 6, lines, className = '', style }) {
  if (lines) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, ...style }} className={className} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => <span key={i} className="fw-skel" style={{ height, width: i === lines - 1 ? '62%' : '100%', borderRadius: radius }} />)}
      </div>
    );
  }
  return <span className={'fw-skel ' + className} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />;
}
