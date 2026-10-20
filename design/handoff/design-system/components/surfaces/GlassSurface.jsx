import React from 'react';

export function GlassSurface({ strong = false, children, className = '', style }) {
  return <div className={'fw-glass' + (strong ? ' fw-glass--strong' : '') + ' ' + className} style={style}>{children}</div>;
}
