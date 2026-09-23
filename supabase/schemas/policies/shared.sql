CREATE POLICY "Admins can delete CRM events" ON "public"."crm_events" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete automations" ON "public"."crm_automations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete coaches" ON "public"."crm_coaches" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete contact logs" ON "public"."crm_contact_log" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete notes" ON "public"."crm_notes" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete own calendar tokens" ON "public"."crm_google_calendar_tokens" FOR DELETE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role"))))));

CREATE POLICY "Admins can delete replies" ON "public"."crm_replies" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete segments" ON "public"."crm_segments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete sequence enrollments" ON "public"."crm_sequence_enrollments" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete sequence steps" ON "public"."crm_sequence_steps" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete sequences" ON "public"."crm_sequences" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete suppressions" ON "public"."crm_email_suppressions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can delete tasks" ON "public"."crm_tasks" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert CRM events" ON "public"."crm_events" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert automations" ON "public"."crm_automations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert coaches" ON "public"."crm_coaches" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert contact logs" ON "public"."crm_contact_log" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert notes" ON "public"."crm_notes" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert own calendar tokens" ON "public"."crm_google_calendar_tokens" FOR INSERT WITH CHECK ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role"))))));

CREATE POLICY "Admins can insert replies" ON "public"."crm_replies" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert segments" ON "public"."crm_segments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert sequence enrollments" ON "public"."crm_sequence_enrollments" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert sequence steps" ON "public"."crm_sequence_steps" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert sequences" ON "public"."crm_sequences" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert suppressions" ON "public"."crm_email_suppressions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can insert tasks" ON "public"."crm_tasks" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can manage templates" ON "public"."crm_email_templates" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can read admin_events" ON "public"."admin_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can read all analytics events" ON "public"."admin_analytics_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can read all client errors" ON "public"."admin_client_errors" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can read audit logs" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "Admins can read error logs" ON "public"."error_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "Admins can read login attempts" ON "public"."login_attempts" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "Admins can update CRM events" ON "public"."crm_events" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update admin_events" ON "public"."admin_events" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update automations" ON "public"."crm_automations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update coaches" ON "public"."crm_coaches" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update contact logs" ON "public"."crm_contact_log" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update demo requests" ON "public"."demo_requests" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update notes" ON "public"."crm_notes" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update own calendar tokens" ON "public"."crm_google_calendar_tokens" FOR UPDATE USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role"))))));

CREATE POLICY "Admins can update replies" ON "public"."crm_replies" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update segments" ON "public"."crm_segments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update sequence enrollments" ON "public"."crm_sequence_enrollments" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update sequence steps" ON "public"."crm_sequence_steps" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update sequences" ON "public"."crm_sequences" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update suppressions" ON "public"."crm_email_suppressions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can update tasks" ON "public"."crm_tasks" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all CRM events" ON "public"."crm_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all automations" ON "public"."crm_automations" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all coaches" ON "public"."crm_coaches" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all contact logs" ON "public"."crm_contact_log" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all notes" ON "public"."crm_notes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all replies" ON "public"."crm_replies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all segments" ON "public"."crm_segments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all sequence enrollments" ON "public"."crm_sequence_enrollments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all sequence steps" ON "public"."crm_sequence_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all sequences" ON "public"."crm_sequences" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all suppressions" ON "public"."crm_email_suppressions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view all tasks" ON "public"."crm_tasks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view demo requests" ON "public"."demo_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view email clicks" ON "public"."email_clicks" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view email events" ON "public"."email_events" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view emails" ON "public"."emails" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Admins can view own calendar tokens" ON "public"."crm_google_calendar_tokens" FOR SELECT USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role"))))));

CREATE POLICY "Anyone can create demo requests" ON "public"."demo_requests" FOR INSERT TO "authenticated", "anon" WITH CHECK (true);

CREATE POLICY "Authenticated users can insert audit logs" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "No direct deletes by users" ON "public"."email_clicks" FOR DELETE USING (false);

CREATE POLICY "No direct deletes by users" ON "public"."emails" FOR DELETE USING (false);

CREATE POLICY "No direct inserts by users" ON "public"."email_clicks" FOR INSERT WITH CHECK (false);

CREATE POLICY "No direct inserts by users" ON "public"."emails" FOR INSERT WITH CHECK (false);

CREATE POLICY "No direct updates by users" ON "public"."email_clicks" FOR UPDATE USING (false);

CREATE POLICY "No direct updates by users" ON "public"."emails" FOR UPDATE USING (false);

CREATE POLICY "Service role can insert admin_events" ON "public"."admin_events" FOR INSERT TO "service_role" WITH CHECK (true);

CREATE POLICY "Service role can manage admin_events" ON "public"."admin_events" TO "service_role" USING (true);

CREATE POLICY "Service role can manage audit logs" ON "public"."audit_log" TO "service_role" USING (true);

CREATE POLICY "Service role can manage demo requests" ON "public"."demo_requests" TO "service_role" USING (true);

CREATE POLICY "Service role can manage error logs" ON "public"."error_logs" TO "service_role" USING (true);

CREATE POLICY "Service role can manage login attempts" ON "public"."login_attempts" TO "service_role" USING (true);

CREATE POLICY "Service role full access" ON "public"."device_tokens" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Service role full access on push_subscriptions" ON "public"."push_subscriptions" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "Service role only for api perf log" ON "public"."admin_api_perf_log" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "Users can create own push subscriptions" ON "public"."push_subscriptions" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can delete own push subscriptions" ON "public"."push_subscriptions" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can delete own tokens" ON "public"."device_tokens" FOR DELETE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can insert own analytics events" ON "public"."admin_analytics_events" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can insert own client errors" ON "public"."admin_client_errors" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can insert own tokens" ON "public"."device_tokens" FOR INSERT WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can update own push subscriptions" ON "public"."push_subscriptions" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can update own tokens" ON "public"."device_tokens" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can view own push subscriptions" ON "public"."push_subscriptions" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "Users can view own tokens" ON "public"."device_tokens" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));

CREATE POLICY "admin_allowlist_no_client_access" ON "public"."admin_allowlist" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);

CREATE POLICY "admin_error_resolutions_select_super_admin" ON "public"."admin_error_resolutions" FOR SELECT TO "authenticated" USING ("public"."is_super_admin"());

CREATE POLICY "admin_read_all" ON "public"."users" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "api_call_logs_admin_read" ON "public"."api_call_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "api_call_logs_service_write" ON "public"."api_call_logs" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "auth_metrics_hourly_admin_read" ON "public"."auth_metrics_hourly" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "auth_metrics_hourly_service_write" ON "public"."auth_metrics_hourly" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "auth_rate_limits_no_client_access" ON "public"."auth_rate_limits" AS RESTRICTIVE TO "authenticated", "anon" USING (false) WITH CHECK (false);

CREATE POLICY "background_job_logs_admin_read" ON "public"."background_job_logs" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "background_job_logs_service_write" ON "public"."background_job_logs" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "crm_stage_transitions_admin_read" ON "public"."crm_stage_transitions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = "auth"."uid"()) AND ("users"."role" = 'admin'::"public"."user_role")))));

CREATE POLICY "crm_unmatched_inbound_deny_all" ON "public"."crm_unmatched_inbound" AS RESTRICTIVE USING (false) WITH CHECK (false);

CREATE POLICY "error_logs_insert_authenticated_self" ON "public"."error_logs" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "error_rate_hourly_admin_read" ON "public"."error_rate_hourly" FOR SELECT TO "authenticated" USING ("public"."is_admin"());

CREATE POLICY "error_rate_hourly_service_write" ON "public"."error_rate_hourly" TO "service_role" USING ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text")) WITH CHECK ((( SELECT "auth"."role"() AS "role") = 'service_role'::"text"));

CREATE POLICY "helm_repair_ro_insert_own_heartbeat" ON "public"."background_job_logs" FOR INSERT TO "helm_repair_ro" WITH CHECK (("job_type" = 'selfheal-repair'::"text"));

CREATE POLICY "helm_repair_ro_select_admin_error_resolutions" ON "public"."admin_error_resolutions" FOR SELECT TO "helm_repair_ro" USING (true);

CREATE POLICY "helm_repair_ro_select_admin_events" ON "public"."admin_events" FOR SELECT TO "helm_repair_ro" USING (true);

CREATE POLICY "helm_repair_ro_select_background_job_logs" ON "public"."background_job_logs" FOR SELECT TO "helm_repair_ro" USING (true);

CREATE POLICY "notifications_delete_own" ON "public"."notifications" FOR DELETE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "notifications_insert_own" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "notifications_select_own" ON "public"."notifications" FOR SELECT USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "notifications_update_own" ON "public"."notifications" FOR UPDATE USING (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "organizations_delete_own_coach" ON "public"."organizations" FOR DELETE USING (((EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("golf_coaches"."organization_id" = "organizations"."id")))) OR ((NOT (EXISTS ( SELECT 1
   FROM "public"."golf_coaches"
  WHERE ("golf_coaches"."organization_id" = "organizations"."id")))) AND (NOT (EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE ("baseball_coaches"."organization_id" = "organizations"."id")))) AND ("created_at" > ("now"() - '00:05:00'::interval)))));

CREATE POLICY "organizations_insert_coaches" ON "public"."organizations" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."users"
  WHERE (("users"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("users"."role" = 'coach'::"public"."user_role")))));

CREATE POLICY "organizations_select_all" ON "public"."organizations" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "organizations_update_own" ON "public"."organizations" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."baseball_coaches"
  WHERE (("baseball_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("baseball_coaches"."organization_id" = "organizations"."id"))
UNION
 SELECT 1
   FROM "public"."golf_coaches"
  WHERE (("golf_coaches"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("golf_coaches"."organization_id" = "organizations"."id")))));

CREATE POLICY "users_insert_own" ON "public"."users" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT USING ((( SELECT "auth"."uid"() AS "uid") = "id"));

CREATE POLICY "users_update_own" ON "public"."users" FOR UPDATE USING ((( SELECT "auth"."uid"() AS "uid") = "id"));
