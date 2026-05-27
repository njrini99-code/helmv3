-- Migration: CRM Email Templates V2
-- Add new funnel-stage categories and 15 new default templates

-- 1. Drop old CHECK constraint and add new one with additional categories
ALTER TABLE crm_email_templates
  DROP CONSTRAINT IF EXISTS crm_email_templates_category_check;

ALTER TABLE crm_email_templates
  ADD CONSTRAINT crm_email_templates_category_check
  CHECK (category IN (
    'intro', 'follow_up', 'demo_invite', 'proposal', 'check_in', 'general',
    'cold_outreach', 'active_conversation', 're_engage', 'close', 'post_close'
  ));

-- 2. Mark all existing templates as non-default (preserve for contact log references)
UPDATE crm_email_templates SET is_default = false;

-- 3. Insert 15 new default templates

-- ═══════════════════════════════════════════
-- COLD OUTREACH (4)
-- ═══════════════════════════════════════════

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Cold Intro',
  'Quick intro — {school} Golf',
  E'I''m Rick, founder of GolfHelm — we build team management and analytics tools specifically for college golf programs.\n\nA few {conference} programs have been using us this season and the feedback has been great. Thought it''d be worth a quick intro to see if it could be useful for {school}.\n\nWould you have 10 minutes this week for a quick call?',
  'cold_outreach',
  ARRAY['school', 'conference'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Post-Call No Answer',
  'Just tried calling — {school} Golf',
  E'Just gave you a call a couple minutes ago to introduce myself. Didn''t want to leave a long voicemail so figured I''d shoot you a quick email instead.\n\nI''m Rick — I run GolfHelm, a team management and analytics platform built specifically for college golf. A few {conference} coaches have been using it this season.\n\nWould love to give you a quick walkthrough whenever you have a few minutes. What works for your schedule?',
  'cold_outreach',
  ARRAY['school', 'conference'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Post-Call Connected',
  'Great chatting — {school} Golf',
  E'Really enjoyed our conversation. Sounds like you''ve got a great thing going at {school}.\n\nAs promised, here''s a quick overview of what GolfHelm can do for your program. Happy to set up a proper demo whenever works for you.\n\nJust let me know what day/time is best.',
  'cold_outreach',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Referral Intro',
  '{school} Golf — introduction',
  E'A colleague of mine suggested I reach out — they mentioned you might be looking at ways to streamline team management at {school}.\n\nI run GolfHelm. We help college golf programs manage rounds, stats, qualifiers, messaging, and coaching analytics all in one place.\n\nWould be happy to show you what we''re working on if you have a few minutes.',
  'cold_outreach',
  ARRAY['school'],
  true,
  0
);

-- ═══════════════════════════════════════════
-- ACTIVE CONVERSATION (4)
-- ═══════════════════════════════════════════

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Demo Follow Up',
  'Following up — {school} Golf demo',
  E'Thanks for taking the time to look at GolfHelm. Hope it gave you a good sense of what it could do for {school}.\n\nLet me know if any questions came up after we talked, or if you''d like to loop in anyone else on the staff for a second look.\n\nHappy to help however I can.',
  'active_conversation',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Check In',
  'Checking in — {school} Golf',
  E'Hope the season is going well for {school}. Just wanted to check in and see if there''s anything on the team management or analytics side where we might be able to help.\n\nWe''ve added some great new features lately that {conference} programs have been loving. Happy to give you a quick update whenever it''s convenient.',
  'active_conversation',
  ARRAY['school', 'conference'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Seasonal',
  'Heading into the season — {school} Golf',
  E'With the season coming up, wanted to check in on how {school} is setting up for the year. A lot of programs use this time to get their round tracking and qualifier systems dialed in.\n\nIf you''re thinking about making any changes to how you manage stats or team logistics, happy to show you what we''ve built.',
  'active_conversation',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Feature Spotlight',
  'New in GolfHelm — thought of {school}',
  E'We just shipped something I think you''d find really useful — our CoachHelm AI engine now surfaces coaching insights and player development patterns automatically from round data.\n\nA couple {conference} coaches told me it''s changed how they prep for individual player meetings. Thought of you when I saw their feedback.\n\nWant me to walk you through it?',
  'active_conversation',
  ARRAY['school', 'conference'],
  true,
  0
);

-- ═══════════════════════════════════════════
-- RE-ENGAGE (3)
-- ═══════════════════════════════════════════

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Haven''t Heard Back',
  'Still interested? — {school} Golf',
  E'I know things get busy during the season — just wanted to bump this in case it got buried.\n\nNo pressure at all. If the timing isn''t right, totally understand. Just didn''t want you to miss out if it''s still on your radar.\n\nHappy to reconnect whenever works.',
  're_engage',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'New Feature Announcement',
  'Something new for {school} Golf',
  E'Wanted to reach back out because we''ve made some big improvements since we last talked. The platform has come a long way and I think it''d be worth another look.\n\nHappy to do a quick 10-minute update call if you''re open to it. No commitment — just want to show you what''s changed.',
  're_engage',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Conference Peer',
  '{conference} golf programs are using this',
  E'Wanted to let you know that several {conference} programs have come on board with GolfHelm this season. The feedback has been really positive, especially around round tracking and team analytics.\n\nFigured you might want to see what your peers are using. Happy to set up a quick call.',
  're_engage',
  ARRAY['conference'],
  true,
  0
);

-- ═══════════════════════════════════════════
-- CLOSE (2)
-- ═══════════════════════════════════════════

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Proposal',
  'GolfHelm for {school} — next steps',
  E'Based on our conversations, I put together a quick overview of what GolfHelm would look like for {school}. Everything is included — round tracking, qualifiers, team management, messaging, CoachHelm AI analytics.\n\nHappy to walk through any questions or adjust anything. What''s the best way to move forward on your end?',
  'close',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Decision Nudge',
  'Quick question — {school} Golf',
  E'Just wanted to follow up and see where things stand on your end. I know you mentioned wanting to get something in place, and I want to make sure {school} doesn''t miss the window to get set up before the season gets going.\n\nIs there anything I can help with to make the decision easier?',
  'close',
  ARRAY['school'],
  true,
  0
);

-- ═══════════════════════════════════════════
-- POST-CLOSE (2)
-- ═══════════════════════════════════════════

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Welcome Onboarding',
  'Welcome to GolfHelm — {school} Golf',
  E'Excited to have {school} on board! Here''s what happens next:\n\n1. I''ll send you a team invite code — share it with your players to get them set up\n2. Start logging rounds and the stats engine kicks in automatically\n3. CoachHelm AI will start surfacing insights after a few rounds of data\n\nI''m here to help with anything during setup. Don''t hesitate to reach out.',
  'post_close',
  ARRAY['school'],
  true,
  0
);

INSERT INTO crm_email_templates (name, subject, body, category, merge_tags, is_default, usage_count)
VALUES (
  'Referral Ask',
  'Quick favor — {school} Golf',
  E'Hope things are going well with GolfHelm at {school}. Really appreciate you being an early adopter.\n\nQuick question — is there another coach in your circle who might benefit from what we''re building? A quick intro email or text would mean a lot.\n\nNo pressure at all. Just thought I''d ask since you''ve been having a great experience.',
  'post_close',
  ARRAY['school'],
  true,
  0
);
