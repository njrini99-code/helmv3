import React from 'react';

export function Surface({ title, subtitle, actions, rule = 'none', serif = false, variant = 'default', footer, padded = true, children, className = '', style, as: Tag = 'section' }) {
  const cls = ['fw-surface', variant !== 'default' && 'fw-surface--' + variant, className].filter(Boolean).join(' ');
  const hasHead = title || actions;
  return (
    <Tag className={cls} style={style}>
      {hasHead && (
        <div className="fw-surface__head">
          <div style={{ minWidth: 0 }}>
            {title && <h3 className={'fw-surface__title' + (serif ? ' fw-surface__title--serif' : '')}>{title}</h3>}
            {subtitle && <div className="fw-surface__sub">{subtitle}</div>}
          </div>
          {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
        </div>
      )}
      {hasHead && rule === 'hair' && <div className="fw-surface__rule" />}
      {padded ? <div className="fw-surface__body">{children}</div> : children}
      {footer && <div className="fw-surface__foot">{footer}</div>}
    </Tag>
  );
}
