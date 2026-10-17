import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// setCourseImageUrl lets any golf team member (coach or player) set a course
// photo (owner decision 2026-10-16). It writes through the SECURITY DEFINER
// function golf_set_course_image, never through updateCourse, so a player is
// not stopped by the coach gate and no direct golf_courses UPDATE is issued.

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));
vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));

let currentClient: unknown = null;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => currentClient }));

import { setCourseImageUrl } from '../course-library';

const SUPABASE_URL = 'https://proj.supabase.co';
const COURSE_ID = '11111111-1111-1111-1111-111111111111';
const GOOD_URL = `${SUPABASE_URL}/storage/v1/object/public/course-images/courses/${COURSE_ID}/a.jpg`;

/** A client for a signed-in user. `coach` is the golf_coaches row (null for a player). */
function makeClient(opts: {
  user?: { id: string } | null;
  coach?: { id: string; organization_id: string } | null;
  rpc?: { error: { code?: string; message: string } | null };
}) {
  const user = opts.user === undefined ? { id: 'u1' } : opts.user;
  const from = vi.fn((table: string) => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.eq = () => b;
    b.maybeSingle = async () => ({ data: table === 'golf_coaches' ? (opts.coach ?? null) : null, error: null });
    b.update = vi.fn(() => b);
    b.insert = vi.fn(async () => ({ error: null }));
    return b;
  });
  const rpc = vi.fn(async () => opts.rpc ?? { data: null, error: null });
  return {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from,
    rpc,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('setCourseImageUrl', () => {
  it('lets a player (no golf_coaches row) set the photo through golf_set_course_image', async () => {
    const client = makeClient({ coach: null });
    currentClient = client;

    const res = await setCourseImageUrl(COURSE_ID, GOOD_URL);

    expect(res).toEqual({ success: true, data: { imageUrl: GOOD_URL } });
    expect(client.rpc).toHaveBeenCalledWith('golf_set_course_image', {
      p_course_id: COURSE_ID,
      p_image_url: GOOD_URL,
    });
    expect(client.from).not.toHaveBeenCalledWith('golf_courses');
    expect(revalidatePath).toHaveBeenCalledWith('/golf/dashboard/courses');
  });

  it('lets a coach set the photo the same way', async () => {
    const client = makeClient({ coach: { id: 'co1', organization_id: 'org1' } });
    currentClient = client;

    const res = await setCourseImageUrl(COURSE_ID, GOOD_URL);

    expect(res.success).toBe(true);
    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it('rejects an unauthenticated caller before calling the database', async () => {
    const client = makeClient({ user: null });
    currentClient = client;

    const res = await setCourseImageUrl(COURSE_ID, GOOD_URL);

    expect(res).toEqual({ success: false, error: 'You must be logged in' });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('rejects a URL outside our course-images bucket, logs it, and does not call the database', async () => {
    const client = makeClient({});
    currentClient = client;

    const res = await setCourseImageUrl(COURSE_ID, 'https://evil.example/storage/v1/object/public/course-images/x.jpg');

    expect(res).toEqual({ success: false, error: 'Invalid image URL' });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('setCourseImageUrl rejected an image URL'),
      expect.objectContaining({ action: 'courseLibrary.setCourseImageUrl' }),
      'warning',
    );
  });

  it.each(['PGRST202', '42883'])(
    'falls back to the coach-only updateCourse path when the RPC is missing (%s), and logs it',
    async (code) => {
      const updated = { id: COURSE_ID, name: 'Test Course', image_url: GOOD_URL, created_by_user_id: 'u2' };
      const golfCourses: Record<string, unknown> = {};
      golfCourses.select = () => golfCourses;
      golfCourses.eq = () => golfCourses;
      golfCourses.is = () => golfCourses;
      golfCourses.single = async () => ({ data: updated, error: null });
      golfCourses.maybeSingle = async () => ({ data: { id: COURSE_ID, image_url: null, created_by_user_id: 'u2' }, error: null });
      golfCourses.update = vi.fn(() => golfCourses);
      const client = makeClient({ coach: { id: 'co1', organization_id: 'org1' }, rpc: { error: { code, message: 'function not found' } } });
      const baseFrom = client.from;
      client.from = vi.fn((t: string) => (t === 'golf_courses' ? golfCourses : baseFrom(t))) as typeof client.from;
      currentClient = client;

      const res = await setCourseImageUrl(COURSE_ID, GOOD_URL);

      expect(res).toEqual({ success: true, data: { imageUrl: GOOD_URL } });
      expect(client.rpc).toHaveBeenCalledTimes(1);
      expect(golfCourses.update).toHaveBeenCalledWith(expect.objectContaining({ image_url: GOOD_URL }));
      expect(logServerError).toHaveBeenCalledWith(
        expect.stringContaining('not deployed yet'),
        expect.objectContaining({ action: 'courseLibrary.setCourseImageUrl', extra: { courseId: COURSE_ID, code } }),
        'warning',
      );
    },
  );

  it('falls back to the old refusal for a player when the RPC is missing', async () => {
    const client = makeClient({ coach: null, rpc: { error: { code: 'PGRST202', message: 'function not found' } } });
    currentClient = client;

    const res = await setCourseImageUrl(COURSE_ID, GOOD_URL);

    expect(res).toEqual({ success: false, error: 'Only coaches can manage the course library' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([
    ['42501', 'Only members of a golf team can set a course photo'],
    ['22023', 'Invalid image URL'],
    ['P0002', 'That course no longer exists'],
    ['28000', 'You must be logged in'],
    ['XX000', 'Failed to save the course photo'],
  ])('maps database error %s to a short message and logs it', async (code, message) => {
    const client = makeClient({ rpc: { error: { code, message: 'raw db text' } } });
    currentClient = client;

    const res = await setCourseImageUrl(COURSE_ID, GOOD_URL);

    expect(res).toEqual({ success: false, error: message });
    expect(res.success === false && res.error).not.toContain('raw db text');
    expect(logServerError).toHaveBeenCalledWith(
      expect.stringContaining('setCourseImageUrl failed'),
      expect.objectContaining({
        action: 'courseLibrary.setCourseImageUrl',
        extra: { courseId: COURSE_ID, code },
      }),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
