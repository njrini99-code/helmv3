// @vitest-environment jsdom
/**
 * The insight-angle Why visuals, one render per angle, from stored evidence
 * parsed by `angleWhyOf`. Each draws its picture and its receipts: the date
 * window, the denominators, what was left out, and example holes that link to
 * the round (only for a real round id).
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { angleWhyOf, type AngleWhyView } from '@/lib/coachhelm/root-map/angle-why';
import {
  EXAMPLE_ROUND_ID,
  approachMissEvidence,
  floorEvidence,
  lieEvidence,
  teeMissEvidence,
  threePuttEvidence,
} from '@/lib/coachhelm/root-map/angle-why.fixtures';
import { AngleWhy } from '../AngleWhy';

function renderAngle(evidence: unknown): HTMLElement {
  const view = angleWhyOf(evidence) as AngleWhyView;
  expect(view).not.toBeNull();
  const { container } = render(<AngleWhy view={view} />);
  return container;
}

function expectReceipts(container: HTMLElement, sample: RegExp) {
  const receipts = container.querySelector('[data-slot="angle-receipts"]') as HTMLElement;
  expect(receipts.textContent).toMatch(/Jun 1 – Sep 1/);
  expect(receipts.textContent).toMatch(sample);
  const examples = receipts.querySelector('[data-slot="angle-examples"]') as HTMLElement;
  expect(within(examples).getByRole('link', { name: /Hole 7/ })).toHaveAttribute('href', `/golf/dashboard/rounds/${EXAMPLE_ROUND_ID}`);
  // a malformed round id is listed, never linked
  expect(within(examples).getByText('Hole 12')).toBeInTheDocument();
  expect(within(examples).getAllByRole('link')).toHaveLength(1);
}

describe('AngleWhy visuals', () => {
  it('lie approach: fairway vs rough per band, with receipts and what was left out', () => {
    const c = renderAngle(lieEvidence);
    expect(screen.getByRole('heading', { name: 'Fairway vs rough, band by band' })).toBeInTheDocument();
    expect(c.querySelectorAll('[data-slot="lie-band"]')).toHaveLength(2);
    expect(c.querySelector('[data-slot="lie-chain"]')).toBeNull();
    expectReceipts(c, /22 rough approaches in tested bands/);
    expect(c.textContent).toMatch(/3 left out/);
  });

  it('lie approach, fairway exposure: shows the tee-to-approach chain', () => {
    const c = renderAngle({ ...lieEvidence, detail: { ...lieEvidence.detail, cause: 'fairway_exposure' } });
    expect(c.querySelector('[data-slot="lie-chain"]')?.textContent).toMatch(/48%.*fairways.*57%.*team/);
  });

  it('bad-day floor: one dot per round against median and P80, and the split', () => {
    const c = renderAngle(floorEvidence);
    expect(screen.getByRole('heading', { name: 'Bad rounds against the typical round' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /5 rounds by score to par per 18\. Median \+4\.0, P80 \+8\.0/ })).toBeInTheDocument();
    expect(c.querySelector('[data-slot="floor-split"]')).not.toBeNull();
    expectReceipts(c, /2 bad rounds/);
  });

  it('three-putt autopsy: pathways and first-putt leaves', () => {
    const c = renderAngle(threePuttEvidence);
    expect(screen.getByRole('heading', { name: 'How the 3-putts happen' })).toBeInTheDocument();
    expect(c.querySelectorAll('[data-slot="putt-pathway"]')).toHaveLength(2);
    expect(c.querySelectorAll('[data-slot="putt-leave-band"]')).toHaveLength(1);
    expectReceipts(c, /16 three putts/);
  });

  it('tee miss compass: left / fairway / right with the worse side marked, and the club chain', () => {
    const c = renderAngle(teeMissEvidence);
    expect(screen.getByRole('heading', { name: 'What a tee miss costs, by side' })).toBeInTheDocument();
    expect([...c.querySelectorAll('[data-slot="miss-side"]')].map((s) => s.getAttribute('data-side'))).toEqual(['left', 'fairway', 'right']);
    expect(c.textContent).toMatch(/Miss side recorded on 46 of 50 missed fairways \(92%\)/);
    const chain = c.querySelector('[data-slot="tee-club-chain"]') as HTMLElement;
    expect(within(chain).getByRole('table', { name: 'Fairways hit by club and par' })).toBeInTheDocument();
    expect(chain.textContent).toMatch(/Non-driver holes are chosen, not random\./);
    expectReceipts(c, /116 tee shots/);
  });

  it('approach miss compass: four sides around the green, up-and-down per side', () => {
    const c = renderAngle(approachMissEvidence);
    expect(screen.getByRole('heading', { name: 'What finishing the hole costs, by miss side' })).toBeInTheDocument();
    const sides = [...c.querySelectorAll('[data-slot="miss-side"]')];
    expect(sides.map((s) => s.getAttribute('data-side')).sort()).toEqual(['left', 'long', 'right', 'short']);
    expect(c.querySelector('[data-side="short"]')?.textContent).toMatch(/up & down 38%/);
    expect(c.textContent).toMatch(/Miss direction recorded on 60 of 72 missed greens \(83%\)/);
    expectReceipts(c, /72 missed greens/);
  });
});
