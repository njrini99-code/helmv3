CREATE OR REPLACE TRIGGER "baseball_players_guard_recruiting_activated_trg" BEFORE UPDATE OF "recruiting_activated", "player_type" ON "public"."baseball_players" FOR EACH ROW EXECUTE FUNCTION "public"."baseball_players_guard_recruiting_activated"();

CREATE OR REPLACE TRIGGER "trg_bridge_baseball_coach_lifting" AFTER INSERT OR UPDATE OF "organization_id", "user_id" ON "public"."baseball_coaches" FOR EACH ROW EXECUTE FUNCTION "public"."bridge_baseball_coach_lifting_access"();

CREATE OR REPLACE TRIGGER "trg_bridge_baseball_coach_lifting_delete" AFTER DELETE ON "public"."baseball_coaches" FOR EACH ROW EXECUTE FUNCTION "public"."bridge_baseball_coach_lifting_revoke_on_delete"();

CREATE OR REPLACE TRIGGER "update_baseball_coach_recruiting_philosophy_updated_at" BEFORE UPDATE ON "public"."baseball_coach_recruiting_philosophy" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_baseball_conversations_updated_at" BEFORE UPDATE ON "public"."baseball_conversations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at"();

CREATE OR REPLACE TRIGGER "update_baseball_player_percentiles_updated_at" BEFORE UPDATE ON "public"."baseball_player_percentiles" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_baseball_player_stats_updated_at" BEFORE UPDATE ON "public"."baseball_player_stats" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_baseball_team_invitations_updated_at" BEFORE UPDATE ON "public"."baseball_team_invitations" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();

CREATE OR REPLACE TRIGGER "update_baseball_team_lineups_updated_at" BEFORE UPDATE ON "public"."baseball_team_lineups" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();
