import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { fireEvent, render, screen } from '@testing-library/react';
import { HoleSceneFrame } from './HoleSceneFrame';
import { pilotScene } from '@/test/fixtures/course-geometry/pilot';
import { Button } from '@/components/fairway/controls/button';

describe('course-backed putting overview', () => {
  it('uses the reviewed canonical green instead of the abstract oval', () => {
    const markup = renderToStaticMarkup(<HoleSceneFrame scene={pilotScene('cacapon-07', false)} context="entry"
      defaultView="putting" currentPuttingDistanceM={3} />);
    expect(markup).toContain('data-putting-mode="course-green"');
    expect(markup).toContain('data-view="green"');
    expect(markup).not.toContain('data-putting-scale');
    expect(markup).toContain('Mapped green · ball not marked');
    expect(markup).toContain('data-putting-overview="true"');
    expect(markup).toContain('height:272px');
    expect(markup).toContain('aria-label="Open green in 3D"');
  });

  it('retains the explicit abstract fallback when canonical green geometry is not reviewed', () => {
    const scene = pilotScene('cacapon-07', false);
    scene.features = scene.features.map(feature => feature.id === scene.hole.greenFeatureId ? { ...feature, reviewed: false } : feature);
    const markup = renderToStaticMarkup(<HoleSceneFrame scene={scene} context="entry"
      defaultView="putting" currentPuttingDistanceM={3} />);
    expect(markup).toContain('data-putting-mode="abstract"');
    expect(markup).toContain('data-putting-scale');
    expect(markup).toContain('Illustrated putting view');
  });
});

describe('player view details (outside-world §3.6)', () => {
  it('shows Details and sources in a bottom sheet over the course, not in the inspector aside', () => {
    render(<HoleSceneFrame scene={pilotScene('cacapon-07', false)} context="entry" />);
    fireEvent.click(screen.getByRole('button', { name: /Expand course view|Open green in 3D/ }));
    expect(document.body.querySelector('[data-slot="player-details-sheet"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Details and sources' }));
    const sheet = document.body.querySelector('[data-slot="player-details-sheet"]');
    expect(sheet).not.toBeNull();
    expect(sheet!.closest('[data-vaul-drawer]')).not.toBeNull();
    expect(sheet!.textContent).toContain('Estimated pin');
    expect(document.querySelector('[data-slot="course-inspector"]')?.textContent ?? '').not.toContain('Estimated pin');
  });
});

describe('stage presentation (One-Tap "the course is the screen")', () => {
  it('labels the saved tee and round hole instead of the geometry build scorecard', () => {
    const scene = pilotScene('cacapon-07', false);
    const before = JSON.stringify(scene.hole);
    const markup = renderToStaticMarkup(<HoleSceneFrame scene={scene} context="entry" presentation="stage" scorecard={{ number: 10, par: 5, yardage: 410 }} />);
    expect(markup).toContain('410');
    expect(markup).toContain('Par 5');
    expect(JSON.stringify(scene.hole)).toBe(before);
  });
  it('fills its container with the expanded course, no trigger, no Close, and hosts the caller\'s HUD and footer', () => {
    render(<HoleSceneFrame scene={pilotScene('cacapon-07', false)} context="entry" presentation="stage"
      stageOverlay={<span data-testid="hud">HUD</span>} stageFooter={<Button variant="primary">Mark ball</Button>} />);
    const stage = document.querySelector('[data-presentation="stage"]')!;
    expect(stage).not.toBeNull();
    expect(stage.getAttribute('data-current-view')).toBe('hole');
    expect(screen.queryByRole('button', { name: /Expand course view|Open green in 3D/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
    expect(screen.getByTestId('hud').textContent).toBe('HUD');
    expect(document.querySelector('[data-slot="stage-footer"]')!.textContent).toBe('Mark ball');
    expect(screen.getByRole('button', { name: 'Choose course area' })).not.toBeNull();
  });
});
