import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function ToastStack({ toasts = [], onDismiss, inline = false }) {
  return (
    <div className={'fw-toasts' + (inline ? ' fw-toasts--inline' : '')} role="region" aria-live="polite" aria-label="Notifications">
      {toasts.map((t) => (
        <div key={t.id} className="fw-toast">
          <Icon name={t.icon || 'circle-check'} size={16} className="fw-toast__icon" />
          <span>{t.title}</span>
          {t.action && <button className="fw-toast__action" onClick={() => { t.action.onClick && t.action.onClick(); onDismiss && onDismiss(t.id); }}>{t.action.label}</button>}
          {!t.action && onDismiss && <button className="fw-toast__action" aria-label="Dismiss" onClick={() => onDismiss(t.id)}><Icon name="x" size={14} /></button>}
        </div>
      ))}
    </div>
  );
}
