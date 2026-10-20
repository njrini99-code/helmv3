import React from 'react';

const TONES = ['sand', 'stone', 'sage', 'mist', 'clay'];
const initialsOf = (n = '') => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const toneOf = (n = '') => TONES[[...n].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % TONES.length];

export function Avatar({ name, initials, src, size = 32, ring = false, tone, className = '' }) {
  return (
    <span className={['fw-avatar', ring && 'fw-avatar--ring', className].filter(Boolean).join(' ')} data-tone={tone || toneOf(name)} style={{ '--s': size + 'px' }} aria-label={name} role="img">
      {src ? <img src={src} alt="" /> : initials || initialsOf(name)}
    </span>
  );
}
