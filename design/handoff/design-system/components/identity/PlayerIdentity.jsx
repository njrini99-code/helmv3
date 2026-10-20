import React from 'react';
import { Avatar } from './Avatar.jsx';

export function PlayerIdentity({ name, meta, initials, src, size = 'md', ring = false, trailing, className = '' }) {
  const px = size === 'lg' ? 56 : size === 'sm' ? 26 : 34;
  return (
    <div className={['fw-identity', size === 'lg' && 'fw-identity--lg', className].filter(Boolean).join(' ')}>
      <Avatar name={name} initials={initials} src={src} size={px} ring={ring} />
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: size === 'lg' ? 4 : 1 }}>
        <span className="fw-identity__name">{name}</span>
        {meta && <span className="fw-identity__meta">{meta}</span>}
      </div>
      {trailing && <div style={{ marginLeft: 'auto' }}>{trailing}</div>}
    </div>
  );
}
