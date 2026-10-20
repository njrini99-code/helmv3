import React from 'react';
import { Button } from '../buttons/Button.jsx';
import { Badge } from '../identity/Badge.jsx';
import { Icon } from '../icons/Icon.jsx';
import { PlayerIdentity } from '../identity/PlayerIdentity.jsx';

export function InsightCard({ player, category, kicker, claim, evidence, source, action, secondaryAction, state = 'default', className = '', style }) {
  const early = state === 'early';
  return (
    <article className={'fw-card fw-insight' + (early ? ' fw-insight--early' : '') + ' ' + className} style={style}>
      <header className="fw-card__head">
        {player ? <PlayerIdentity size="sm" name={player.name} meta={player.meta} initials={player.initials} /> : <span className="fw-insight__kicker">{kicker}</span>}
        <div className="fw-card__aside">
          {early && <Badge tone="warning" dot>Early read</Badge>}
          {category && <Badge tone={early ? 'neutral' : 'accent'}>{category}</Badge>}
        </div>
      </header>
      <div className="fw-insight__body">
        {player && kicker && <span className="fw-insight__kicker">{kicker}</span>}
        <h3 className="fw-insight__claim">{claim}</h3>
        {evidence && <div className="fw-insight__evidence">{evidence}</div>}
      </div>
      {(source || action || secondaryAction) && (
        <footer className="fw-card__foot">
          <span className="fw-card__source">{source && <Icon name="database" size={13} />}{source}</span>
          <div className="fw-card__actions">
            {secondaryAction && <Button size="sm" variant="ghost" onClick={secondaryAction.onClick}>{secondaryAction.label}</Button>}
            {action && <Button size="sm" variant={early ? 'secondary' : 'primary'} rightIcon="arrow-right" onClick={action.onClick}>{action.label}</Button>}
          </div>
        </footer>
      )}
    </article>
  );
}
