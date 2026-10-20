import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function DeltaChip({ value, direction = 'up', tone, className = '' }) {
  const t = tone || (direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'neutral');
  const cls = t === 'positive' ? 'up' : t === 'negative' ? 'down' : 'flat';
  const icon = direction === 'up' ? 'arrow-up-right' : direction === 'down' ? 'arrow-down-right' : 'minus';
  return (
    <span className={'fw-delta fw-delta--' + cls + ' ' + className}>
      <Icon name={icon} size={12} strokeWidth={2} />
      {value}
    </span>
  );
}
