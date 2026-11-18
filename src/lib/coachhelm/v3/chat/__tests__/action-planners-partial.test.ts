import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAnnouncement, executeTask, type AnnouncementPlan, type TaskPlan } from '../action-planners';

const calls = vi.hoisted(() => ({ task: vi.fn(), announcement: vi.fn() }));
vi.mock('@/app/golf/actions/tasks', () => ({ createTask: calls.task }));
vi.mock('@/app/golf/actions/announcements', () => ({ createEnrichedAnnouncement: calls.announcement }));

const task: TaskPlan = { title: 'Waiver', team_id: 't', assignee_ids: ['p'], assignee_names: ['Eli'] };
const announcement: AnnouncementPlan = { title: 'Meeting', body: 'Meet here', recipient_ids: ['p'], recipient_names: ['Eli'] };

beforeEach(() => vi.resetAllMocks());

describe('Ask receipts after failed rollback', () => {
  it('keeps a surviving task, its Open link and assignment failure without inviting another create', async () => {
    calls.task.mockResolvedValue({ success: false, data: { taskId: 'saved' }, error: 'Assignment failed; rollback failed' });
    expect(await executeTask(task)).toMatchObject({ status: 'partial', retryable: false, created: [{ kind: 'task', count: 1, href: '/golf/dashboard/tasks' }], notifications: [], partial_failures: ['Assignment failed; rollback failed'] });
  });

  it('keeps a surviving announcement and warns that it may be team-wide', async () => {
    calls.announcement.mockResolvedValue({ success: false, data: { announcementId: 'saved' }, error: 'Recipients failed; rollback failed' });
    expect(await executeAnnouncement(announcement)).toMatchObject({ status: 'partial', retryable: false, summary: expect.stringMatching(/whole team/), created: [{ kind: 'team update', count: 1, href: '/golf/dashboard/announcements' }], notifications: [] });
  });

  it('allows retry after a known refusal that left no row', async () => {
    calls.task.mockResolvedValue({ success: false, error: 'No row saved' });
    calls.announcement.mockResolvedValue({ success: false, error: 'No row saved' });
    expect(await executeTask(task)).toMatchObject({ status: 'failed', retryable: true, created: [] });
    expect(await executeAnnouncement(announcement)).toMatchObject({ status: 'failed', retryable: true, created: [] });
  });
});
