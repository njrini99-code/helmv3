import React from 'react';

export function FormField({ label, htmlFor, optional = false, help, error, children, className = '' }) {
  return (
    <div className={'fw-field ' + className}>
      {label && (
        <label className="fw-field__label" htmlFor={htmlFor}>
          <span>{label}</span>
          {optional && <span className="fw-field__opt">Optional</span>}
        </label>
      )}
      {children}
      <span className={'fw-field__help' + (error ? ' fw-field__help--error' : '')} role={error ? 'alert' : undefined}>{error || help || ''}</span>
    </div>
  );
}
