import React from 'react';
const LUCIDE_SRC = 'https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js';
let requested = false;
const waiters = new Set();
function ensureLucide() {
  if (typeof window === 'undefined' || window.lucide || requested) return;
  requested = true;
  const s = document.createElement('script');
  s.src = LUCIDE_SRC;
  s.onload = () => waiters.forEach((f) => f());
  document.head.appendChild(s);
}
const toPascal = (n) => String(n).replace(/(^|[-_ ])([a-z0-9])/g, (_, a, b) => b.toUpperCase());

export function Icon({ name, size = 16, strokeWidth = 1.6, label, className, style }) {
  const [, force] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    if (window.lucide) return;
    waiters.add(force); ensureLucide();
    return () => waiters.delete(force);
  }, []);
  const lib = typeof window !== 'undefined' ? window.lucide : null;
  const key = toPascal(name);
  const node = lib ? ((lib.icons && lib.icons[key]) || lib[key]) : null;
  const kids = node ? (node[0] === 'svg' ? node[2] : node) : [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={{ flex: 'none', display: 'block', ...style }}
      role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {(kids || []).map(([tag, attrs], i) => React.createElement(tag, { key: i, ...attrs }))}
    </svg>
  );
}
