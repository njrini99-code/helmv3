import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The "New focus area" bell row and email link to where the player's focus areas are (swap audit CH13-7). Fairway's address
 * redirects to a Development drill Clubhouse does not draw, so the caller can name the screen that is rebuilt.
 */
const recordInAppNotification = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const sendEmailNotification = vi.hoisted(() => vi.fn().mockResolvedValue({ success: true }));
vi.mock('../in-app', () => ({ recordInAppNotification }));
vi.mock('../email', () => ({ sendEmailNotification }));
vi.mock('../push', () => ({}));

const { notifyDevPlanAssigned, FAIRWAY_DEV_PLAN_PATH } = await import('../index');

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
});

describe('notifyDevPlanAssigned', () => {
  it('without a path it links Fairway’s address, in the bell row and in the email', async () => {
    await notifyDevPlanAssigned('u1', 'p@example.com', 'Lag putting', 'putting', 'Coach Reyes');
    expect(FAIRWAY_DEV_PLAN_PATH).toBe('/golf/dashboard/my-development');
    expect(recordInAppNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'dev_plan_assigned', actionUrl: '/golf/dashboard/my-development' }));
    expect(sendEmailNotification).toHaveBeenCalledWith('dev_plan_assigned', 'u1', 'p@example.com', expect.objectContaining({ planUrl: 'https://app.example.test/golf/dashboard/my-development' }));
  });

  it('with a path it links that screen, in the bell row and in the email', async () => {
    await notifyDevPlanAssigned('u1', 'p@example.com', 'Lag putting', 'putting', 'Coach Reyes', '/golf/dashboard/stats?tab=dev');
    expect(recordInAppNotification).toHaveBeenCalledWith(expect.objectContaining({ actionUrl: '/golf/dashboard/stats?tab=dev', title: 'New focus area' }));
    expect(sendEmailNotification).toHaveBeenCalledWith('dev_plan_assigned', 'u1', 'p@example.com', expect.objectContaining({ planUrl: 'https://app.example.test/golf/dashboard/stats?tab=dev' }));
  });
});
