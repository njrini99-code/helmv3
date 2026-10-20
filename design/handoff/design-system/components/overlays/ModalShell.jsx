import React from 'react';
import { IconButton } from '../buttons/IconButton.jsx';
import { Icon } from '../icons/Icon.jsx';

export function ModalShell({ open = true, onClose, title, description, icon, note, children, footer, width = 480, inline = false }) {
  React.useEffect(() => {
    if (!open || !onClose) return;
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={'fw-backdrop' + (inline ? ' fw-backdrop--inline' : '')} onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="fw-modal" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} style={{ '--w': width + 'px' }}>
        <div className="fw-modal__head">
          <div className="fw-modal__lead">
            {icon && <span className="fw-modal__icon"><Icon name={icon} size={17} /></span>}
            <div><h2 className="fw-modal__title">{title}</h2>{description && <p className="fw-modal__desc">{description}</p>}</div>
          </div>
          {onClose && <IconButton icon="x" label="Close" size="sm" onClick={onClose} />}
        </div>
        {children && <div className="fw-modal__body">{children}</div>}
        {footer && <div className="fw-modal__foot">{note && <span className="fw-modal__note">{note}</span>}{footer}</div>}
      </div>
    </div>
  );
}
