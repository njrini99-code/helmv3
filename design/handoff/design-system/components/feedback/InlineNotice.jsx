import React from 'react';
import { Icon } from '../icons/Icon.jsx';

const ICONS = { info: 'info', positive: 'circle-check', warning: 'triangle-alert', danger: 'octagon-alert' };

export function InlineNotice({ tone = 'info', title, children, action, className = '' }) {
  return (
    <div className={'fw-notice fw-notice--' + tone + ' ' + className} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ICONS[tone]} size={16} className="fw-notice__icon" />
      <div>{title && <span className="fw-notice__title">{title}</span>}{children && <span className={title ? 'fw-notice__text' : ''}>{children}</span>}</div>
      {action && <div className="fw-notice__action">{action}</div>}
    </div>
  );
}
