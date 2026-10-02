import './dialog-polyfill';
import { act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Qualifiers hydrate: the server's HTML and the client's first frame are the same, at desktop and phone width. */

vi.mock('../lib/haptics', () => ({ haptic: vi.fn() }));
vi.mock('../lib/track', () => ({ chReport: vi.fn(), chTrail: vi.fn(), chTagSession: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn(), replace: vi.fn() }), usePathname: () => '/golf/dashboard/qualifiers' }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel: vi.fn() }) }));
vi.mock('@/app/golf/actions/golf', () => ({ createGolfQualifier: vi.fn(), setQualifierRoundCourses: vi.fn(), updateGolfQualifierDetails: vi.fn(), updateQualifierStatus: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-setup', () => ({ setQualifierEntrants: vi.fn(), setQualifierSquadSize: vi.fn() }));
vi.mock('@/app/golf/actions/v3/qualifying', () => ({ advanceSelectionState: vi.fn(), confirmQualifierSelection: vi.fn(), removeQualifierCoachPick: vi.fn(), setQualifierCoachPick: vi.fn() }));
vi.mock('@/app/golf/actions/course-library', () => ({ getCourseDetail: vi.fn(), getTeamSavedCourses: vi.fn(), listCoursesStrict: vi.fn() }));

import { QualifiersList } from '../screens/qualifiers/QualifiersList';
import { QualifierDetail } from '../screens/qualifiers/QualifierDetail';
import { QualifierForm } from '../screens/qualifiers/QualifierForm';
import { QualifierSelection } from '../screens/qualifiers/QualifierSelection';
import { previewCreateForm, previewDetail, previewEditForm, previewList, previewSelection } from '../preview/fixtures-qualifiers';
import { PhoneChromeProvider } from '../shell/phone-chrome';
import { ToastProvider } from '../ui/Toast';

const tree = (node: ReactNode) => (
  <ToastProvider>
    <PhoneChromeProvider>
      <div className="ch-root" data-ui="clubhouse">
        {node}
      </div>
    </PhoneChromeProvider>
  </ToastProvider>
);

function atWidth(phone: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: phone, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false }));
}

async function hydrationErrors(node: ReactNode): Promise<string[]> {
  const html = renderToString(tree(node));
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.appendChild(host);
  const errors: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => {
    errors.push(a.map(String).join(' '));
  });
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(host, tree(node), { onRecoverableError: (e) => errors.push(String((e as Error)?.message ?? e)) });
  });
  spy.mockRestore();
  act(() => root?.unmount());
  host.remove();
  return errors.filter((e) => /hydrat|did not match|didn't match/i.test(e));
}

afterEach(() => vi.unstubAllGlobals());

const SCREENS: Array<[string, () => ReactNode]> = [
  ['list coach', () => <QualifiersList data={previewList('coach')} />],
  ['list player', () => <QualifiersList data={previewList('player')} />],
  ['mine', () => <QualifiersList data={previewList('player', 'mine')} />],
  ['detail coach', () => <QualifierDetail data={previewDetail(0, 'coach')} />],
  ['detail player', () => <QualifierDetail data={previewDetail(0, 'player')} />],
  ['detail completed', () => <QualifierDetail data={previewDetail(3, 'coach')} />],
  ['new', () => <QualifierForm data={previewCreateForm()} />],
  ['edit', () => <QualifierForm data={previewEditForm()} />],
  ['selection', () => <QualifierSelection data={previewSelection('picking')} />],
];

describe('Qualifiers hydrate without a mismatch', () => {
  for (const phone of [false, true]) {
    for (const [name, make] of SCREENS) {
      it(`${name} at ${phone ? 'phone' : 'desktop'} width`, async () => {
        atWidth(phone);
        expect(await hydrationErrors(make())).toEqual([]);
      });
    }
  }
});
