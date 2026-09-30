import React from 'react';

export function TextArea({ invalid = false, rows = 3, className = '', ...rest }) {
  return (
    <div className={'fw-input fw-input--textarea ' + className} data-invalid={invalid || undefined}>
      <textarea rows={rows} aria-invalid={invalid || undefined} {...rest} />
    </div>
  );
}
