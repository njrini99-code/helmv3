import { describe, expect, it } from 'vitest';
import { shouldRenderCoachHelmLauncher } from './CoachHelmDrawer';

describe('shouldRenderCoachHelmLauncher', () => {
  it('removes the fixed launcher from Team Stats where it covers the Signal column', () => {
    expect(shouldRenderCoachHelmLauncher('/golf/dashboard/stats/team')).toBe(false);
  });

  it('removes the launcher from the CoachHelm page, which carries the chat as its own tab', () => {
    expect(shouldRenderCoachHelmLauncher('/golf/dashboard/intelligence')).toBe(false);
  });

  it('keeps the launcher on other dashboard surfaces', () => {
    expect(shouldRenderCoachHelmLauncher('/golf/dashboard')).toBe(true);
    expect(shouldRenderCoachHelmLauncher('/golf/dashboard/roster')).toBe(true);
    expect(shouldRenderCoachHelmLauncher('/golf/dashboard/coachhelm/chat')).toBe(true);
  });
});
