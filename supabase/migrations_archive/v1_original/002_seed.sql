-- Seed Colleges
INSERT INTO colleges (name, division, conference, city, state, head_coach) VALUES
  ('Texas A&M', 'D1', 'SEC', 'College Station', 'TX', 'Jim Schlossnagle'),
  ('Texas', 'D1', 'SEC', 'Austin', 'TX', 'David Pierce'),
  ('LSU', 'D1', 'SEC', 'Baton Rouge', 'LA', 'Jay Johnson'),
  ('Florida', 'D1', 'SEC', 'Gainesville', 'FL', 'Kevin O''Sullivan'),
  ('Vanderbilt', 'D1', 'SEC', 'Nashville', 'TN', 'Tim Corbin'),
  ('TCU', 'D1', 'Big 12', 'Fort Worth', 'TX', 'Kirk Saarloos'),
  ('Stanford', 'D1', 'ACC', 'Stanford', 'CA', 'David Esquer'),
  ('UCLA', 'D1', 'Big Ten', 'Los Angeles', 'CA', 'John Savage'),
  ('Arizona State', 'D1', 'Big 12', 'Tempe', 'AZ', 'Willie Bloomquist'),
  ('Miami', 'D1', 'ACC', 'Coral Gables', 'FL', 'J.J. Picollo'),
  ('Ole Miss', 'D1', 'SEC', 'Oxford', 'MS', 'Mike Bianco'),
  ('Arkansas', 'D1', 'SEC', 'Fayetteville', 'AR', 'Dave Van Horn'),
  ('Virginia', 'D1', 'ACC', 'Charlottesville', 'VA', 'Brian O''Connor'),
  ('Wake Forest', 'D1', 'ACC', 'Winston-Salem', 'NC', 'Tom Walter'),
  ('Clemson', 'D1', 'ACC', 'Clemson', 'SC', 'Erik Bakich'),
  ('Texas Tech', 'D1', 'Big 12', 'Lubbock', 'TX', 'Tim Tadlock'),
  ('Oklahoma State', 'D1', 'Big 12', 'Stillwater', 'OK', 'Josh Holliday'),
  ('Oregon State', 'D1', 'Pac-12', 'Corvallis', 'OR', 'Mitch Canham'),
  ('Tennessee', 'D1', 'SEC', 'Knoxville', 'TN', 'Tony Vitello'),
  ('Georgia', 'D1', 'SEC', 'Athens', 'GA', 'Wes Johnson');

-- Seed High Schools
INSERT INTO high_schools (name, city, state) VALUES
  ('Lake Travis High School', 'Austin', 'TX'),
  ('Katy High School', 'Katy', 'TX'),
  ('IMG Academy', 'Bradenton', 'FL'),
  ('Harvard-Westlake', 'Los Angeles', 'CA'),
  ('Barbe High School', 'Lake Charles', 'LA'),
  ('Parkview High School', 'Lilburn', 'GA'),
  ('Orange Lutheran', 'Orange', 'CA'),
  ('Bishop Gorman', 'Las Vegas', 'NV'),
  ('Jesuit High School', 'Tampa', 'FL'),
  ('Cypress Ranch', 'Cypress', 'TX');

-- Create 30 demo players (no auth accounts, display only)
INSERT INTO players (
  user_id, player_type, first_name, last_name,
  primary_position, secondary_position, grad_year, state, city,
  height_feet, height_inches, weight_lbs,
  bats, throws, pitch_velo, exit_velo, sixty_time,
  high_school_name, gpa, about_me,
  recruiting_activated, onboarding_completed, profile_completion_percent
)
SELECT
  NULL,
  'high_school',
  (ARRAY['Marcus', 'Tyler', 'Brandon', 'Dylan', 'Chase', 'Cole', 'Blake', 'Ryan', 'Kyle', 'Derek', 'Jake', 'Austin', 'Bryce', 'Trevor', 'Mason', 'Logan', 'Cooper', 'Hunter', 'Caleb', 'Ethan', 'Noah', 'Liam', 'Carter', 'Jackson', 'Aiden', 'Luke', 'Owen', 'Jack', 'Wyatt', 'Grayson'])[i],
  (ARRAY['Williams', 'Davis', 'Martinez', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Martin', 'Lee', 'Walker', 'Johnson', 'Smith', 'Brown', 'Garcia', 'Miller', 'Wilson', 'Jones', 'White', 'Harris', 'Clark', 'Lewis', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson'])[i],
  (ARRAY['RHP', 'LHP', 'C', 'SS', '2B', '3B', 'CF', 'RF', 'LF', '1B'])[((i-1) % 10) + 1],
  CASE WHEN random() > 0.5 THEN (ARRAY['OF', 'IF', 'RHP', 'LHP', 'C', '1B', '2B', 'SS', '3B'])[floor(random() * 9 + 1)::int] ELSE NULL END,
  (ARRAY[2025, 2025, 2025, 2026, 2026, 2026, 2027, 2027, 2028, 2028])[((i-1) % 10) + 1],
  (ARRAY['TX', 'CA', 'FL', 'GA', 'AZ', 'NC', 'TN', 'LA', 'OK', 'AL'])[((i-1) % 10) + 1],
  (ARRAY['Houston', 'Dallas', 'Austin', 'Phoenix', 'Miami', 'Atlanta', 'Los Angeles', 'San Diego', 'Tampa', 'Nashville'])[((i-1) % 10) + 1],
  5 + ((i-1) % 2),
  (i % 12),
  (165 + (i * 3)),
  (ARRAY['R', 'L', 'S'])[((i-1) % 3) + 1],
  (ARRAY['R', 'L'])[((i-1) % 2) + 1],
  CASE WHEN (ARRAY['RHP', 'LHP'])[((i-1) % 2) + 1] = ANY(ARRAY['RHP', 'LHP']) AND ((i-1) % 10) < 2 THEN (85 + (i % 12))::decimal ELSE NULL END,
  (88 + (i % 14))::decimal,
  (6.4 + (random() * 0.8))::decimal(4,2),
  (ARRAY['Lake Travis High School', 'Katy High School', 'IMG Academy', 'Harvard-Westlake', 'Barbe High School', 'Parkview High School', 'Orange Lutheran', 'Bishop Gorman', 'Jesuit High School', 'Cypress Ranch'])[((i-1) % 10) + 1],
  (3.0 + (random() * 1.0))::decimal(3,2),
  'Dedicated baseball player with a strong work ethic. Looking to compete at the next level and contribute to a winning program.',
  true,
  true,
  85
FROM generate_series(1, 30) AS i;

-- Add some committed players
UPDATE players SET committed_to = (SELECT id FROM colleges WHERE name = 'Texas A&M' LIMIT 1), commitment_date = '2024-11-15' WHERE first_name = 'Marcus';
UPDATE players SET committed_to = (SELECT id FROM colleges WHERE name = 'LSU' LIMIT 1), commitment_date = '2024-10-20' WHERE first_name = 'Tyler';
UPDATE players SET committed_to = (SELECT id FROM colleges WHERE name = 'Vanderbilt' LIMIT 1), commitment_date = '2024-09-05' WHERE first_name = 'Brandon';
