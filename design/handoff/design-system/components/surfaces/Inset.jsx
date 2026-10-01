import React from 'react';

export function Inset({ children, className = '', style }) {
  return <div className={'fw-inset ' + className} style={style}>{children}</div>;
}
