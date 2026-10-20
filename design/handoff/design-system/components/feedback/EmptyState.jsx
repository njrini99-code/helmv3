import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function EmptyState({ icon = 'flag', title, children, action, className = '' }) {
  return (
    <div className={'fw-empty ' + className}>
      <span className="fw-empty__mark"><Icon name={icon} size={20} strokeWidth={1.5} /></span>
      <h3 className="fw-empty__title">{title}</h3>
      {children && <p className="fw-empty__body">{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  );
}
