// Throwaway: mark the local test coach as onboarded so the dashboard is reachable.
import pg from 'pg';

const c = new pg.Client('postgresql://postgres:postgres@127.0.0.1:54322/postgres');
await c.connect();

const TEAM = '752db14d-5d11-476b-8a92-2fc0bfbc2d48';
const USER = '9cc4362d-876d-4a42-8eb2-a8d23a3c33fc';

const orgId = (await c.query(`select organization_id from golf_teams where id=$1`, [TEAM])).rows[0].organization_id;

const coach = (await c.query(
  `update golf_coaches
      set onboarding_completed = true,
          organization_id = $2,
          full_name = 'Bridge Coach',
          email = 'bridge.coach@example.com',
          title = 'Head Coach'
    where user_id = $1
    returning id, onboarding_completed, organization_id`,
  [USER, orgId],
)).rows[0];

console.log('coach:', coach);
console.log('staff:', (await c.query(`select * from golf_team_coach_staff where coach_id=$1`, [coach.id])).rows);
await c.end();
