import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ChPhoneHintProvider, useChPhone } from '../lib/use-phone';

/**
 * Swap audit F-36: the server always rendered desktop, so a cold phone load
 * hid the page until hydration. The server render now follows the device's
 * last layout from the `ch_phone` cookie.
 */
function Probe() {
  return <span>{useChPhone() ? 'phone' : 'desktop'}</span>;
}

describe('useChPhone on the server', () => {
  it('renders the phone structure when the cookie says the device is a phone', () => {
    expect(renderToString(<ChPhoneHintProvider phone><Probe /></ChPhoneHintProvider>)).toContain('phone');
  });
  it('falls back to desktop when the layout is unknown', () => {
    expect(renderToString(<Probe />)).toContain('desktop');
    expect(renderToString(<ChPhoneHintProvider phone={false}><Probe /></ChPhoneHintProvider>)).toContain('desktop');
  });
});
