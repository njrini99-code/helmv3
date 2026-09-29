import React from 'react';
import { scoreboard } from './geom.jsx';

export function ScoreBoard({ rounds = [], par = 72, className = '', style }) {
  const html = scoreboard(rounds.map((r) => ({ l: r.label, v: r.score })), par);
  return <div className={'fw-yb ' + className} style={{ '--n': rounds.length, ...style }} dangerouslySetInnerHTML={{ __html: html }} />;
}
