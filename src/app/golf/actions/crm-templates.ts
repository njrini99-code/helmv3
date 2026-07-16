'use server';

// ============================================================================
// CRM EMAIL TEMPLATES — SERVER ACTIONS (in-app template lifecycle)
// ============================================================================
//
// Full create/update/delete/duplicate/default + send-test lifecycle for the
// crm_email_templates table, so templates can be authored entirely in-app
// instead of via raw SQL inserts. Mirrors the admin-gated server-action style
// of crm-sequences.ts EXACTLY:
//
//   - auth.getUser() fails fast on unauthenticated requests; the table's RLS
//     policy ('admin'-only) is the real gate, but we surface a clean error
//     here rather than letting RLS silently drop rows.
//   - the generated Database type doesn't surface the crm_* tables to the
//     typed client, so we cast through `AnySupabase` (same `as any` escape
//     hatch as crm-sequences.ts / crm-manual-send.ts).
//   - every mutation revalidatePath('/golf/admin/crm').
//
// Gaps closed:
//   G1  — createTemplate accepts `format` ('plain'|'html'|'text') so UI-authored
//         templates are no longer locked to the legacy shell ('plain').
//   G3  — setDefaultTemplate unsets the other defaults in the category, then
//         marks one (single-default-per-category invariant enforced server-side).
//   G4  — sendTestTemplate POSTs ONE recipient to /api/admin/crm/send-email with
//         the template's resolved format, so the test renders identically to a
//         production send (text/plain vs verbatim HTML vs branded shell).
//   G14 — createTemplate persists merge_tags + is_default.
//
// ============================================================================

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { logServerException } from '@/lib/server-error-logger';

// ============================================================================
// Types — exported for consumers (TemplateManager, TemplatePicker)
// ============================================================================
//
// `plain` = legacy paragraph text wrapped in the greeting/signature shell.
// `html`  = full HTML document, sent verbatim (replaces the shell).
// `text`  = true text/plain — no shell, no logo. Best for Gmail-Primary cold
//           outreach (the body must carry its own greeting + sign-off).
export type TemplateFormat = 'plain' | 'html' | 'text';

export type TemplateCategory =
  | 'intro'
  | 'follow_up'
  | 'demo_invite'
  | 'proposal'
  | 'check_in'
  | 'general'
  | 'cold_outreach'
  | 'active_conversation'
  | 're_engage'
  | 'close'
  | 'post_close';

export interface CrmEmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: TemplateCategory;
  format: TemplateFormat;
  merge_tags: string[] | null;
  is_default: boolean;
  usage_count: number;
}

// ============================================================================
// Internal helpers
// ============================================================================
async function getAuthedClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  // Explicit admin gate (defense-in-depth beyond RLS) — these actions can trigger
  // a real send via sendTestTemplate, so don't rely on the table policy alone.
  // Mirrors requireAdmin in crm-engagement.ts and the send-email route check.
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single<{ role: string }>();
  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden');
  }
  return { supabase, user };
}

const CRM_REVALIDATE_PATH = '/golf/admin/crm';

// The typed client doesn't surface the crm_* tables (DB types regen happens
// after migrations land). Cast through `any` so the `from('crm_*')` calls
// type-check. Same approach as crm-sequences.ts / crm-manual-send.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

// Normalize a raw row's `format` to a known TemplateFormat. Older rows may have
// a NULL/blank format; default to 'plain' so the shell still wraps them.
function normalizeFormat(raw: unknown): TemplateFormat {
  return raw === 'html' ? 'html' : raw === 'text' ? 'text' : 'plain';
}

// ============================================================================
// LIST / READ
// ============================================================================
export async function listTemplates(): Promise<CrmEmailTemplate[]> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data, error } = await client
      .from('crm_email_templates')
      .select('id, name, subject, body, category, format, merge_tags, is_default, usage_count')
      // Default templates first within a category, then most-used.
      .order('category', { ascending: true })
      .order('is_default', { ascending: false })
      .order('usage_count', { ascending: false });

    if (error) {
      throw new Error(`Failed to load templates: ${error.message}`);
    }

    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      name: (row.name as string) ?? '',
      subject: (row.subject as string) ?? '',
      body: (row.body as string) ?? '',
      category: ((row.category as string) ?? 'general') as TemplateCategory,
      format: normalizeFormat(row.format),
      merge_tags: (row.merge_tags as string[] | null) ?? null,
      is_default: (row.is_default as boolean | null) ?? false,
      usage_count: (row.usage_count as number | null) ?? 0,
    }));
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.listTemplates',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ============================================================================
// CREATE
// ============================================================================
// Closes G1 (format) + G14 (merge_tags + is_default). When is_default is set
// we route through setDefaultTemplate's invariant so creating a default unsets
// the previous one in that category.
export async function createTemplate(input: {
  name: string;
  category: TemplateCategory;
  subject: string;
  body: string;
  format?: TemplateFormat;
  merge_tags?: string[];
  is_default?: boolean;
}): Promise<CrmEmailTemplate> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const name = input.name.trim();
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!name || !subject || !body) {
      throw new Error('Name, subject, and body are required');
    }

    const { data, error } = await client
      .from('crm_email_templates')
      .insert({
        name,
        category: input.category,
        subject,
        body,
        format: input.format ?? 'plain',
        merge_tags: input.merge_tags ?? null,
        // Insert as non-default first; promote via setDefaultTemplate below so
        // the single-default-per-category invariant is enforced in one place.
        is_default: false,
        usage_count: 0,
        created_by: user.id,
      })
      .select('id, name, subject, body, category, format, merge_tags, is_default, usage_count')
      .single();

    if (error) {
      throw new Error(`Failed to create template: ${error.message}`);
    }

    const created = data as Record<string, unknown>;
    const id = created.id as string;

    if (input.is_default) {
      return setDefaultTemplate(id, input.category);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return {
      id,
      name: created.name as string,
      subject: created.subject as string,
      body: created.body as string,
      category: created.category as TemplateCategory,
      format: normalizeFormat(created.format),
      merge_tags: (created.merge_tags as string[] | null) ?? null,
      is_default: (created.is_default as boolean | null) ?? false,
      usage_count: (created.usage_count as number | null) ?? 0,
    };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.createTemplate',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ============================================================================
// UPDATE
// ============================================================================
// Partial patch. If the patch flips is_default to true we delegate to
// setDefaultTemplate so the category invariant holds; everything else is a
// plain update. (Toggling is_default to false is allowed directly — leaving a
// category with no default is fine.)
export async function updateTemplate(
  id: string,
  fields: Partial<{
    name: string;
    category: TemplateCategory;
    subject: string;
    body: string;
    format: TemplateFormat;
    merge_tags: string[] | null;
    is_default: boolean;
  }>,
): Promise<CrmEmailTemplate> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    // Build the patch, trimming string fields when present.
    const patch: Record<string, unknown> = {};
    if (fields.name !== undefined) patch.name = fields.name.trim();
    if (fields.category !== undefined) patch.category = fields.category;
    if (fields.subject !== undefined) patch.subject = fields.subject.trim();
    if (fields.body !== undefined) patch.body = fields.body.trim();
    if (fields.format !== undefined) patch.format = fields.format;
    if (fields.merge_tags !== undefined) patch.merge_tags = fields.merge_tags;

    // Promoting to default must go through the invariant helper. We still apply
    // the rest of the patch first so name/body/etc. changes land in the same call.
    const promoteToDefault = fields.is_default === true;
    if (fields.is_default === false) patch.is_default = false;

    if (Object.keys(patch).length > 0) {
      const { error } = await client
        .from('crm_email_templates')
        .update(patch)
        .eq('id', id);
      if (error) {
        throw new Error(`Failed to update template: ${error.message}`);
      }
    }

    if (promoteToDefault) {
      // Resolve the category to scope the default-unset (use the incoming patch
      // value, else read it back from the row).
      let category = fields.category;
      if (!category) {
        const { data: row, error: readErr } = await client
          .from('crm_email_templates')
          .select('category')
          .eq('id', id)
          .single();
        if (readErr) {
          throw new Error(`Failed to resolve template category: ${readErr.message}`);
        }
        category = ((row as { category: string }).category ?? 'general') as TemplateCategory;
      }
      return setDefaultTemplate(id, category);
    }

    const { data, error } = await client
      .from('crm_email_templates')
      .select('id, name, subject, body, category, format, merge_tags, is_default, usage_count')
      .eq('id', id)
      .single();
    if (error) {
      throw new Error(`Failed to reload template: ${error.message}`);
    }

    const row = data as Record<string, unknown>;
    revalidatePath(CRM_REVALIDATE_PATH);
    return {
      id: row.id as string,
      name: row.name as string,
      subject: row.subject as string,
      body: row.body as string,
      category: row.category as TemplateCategory,
      format: normalizeFormat(row.format),
      merge_tags: (row.merge_tags as string[] | null) ?? null,
      is_default: (row.is_default as boolean | null) ?? false,
      usage_count: (row.usage_count as number | null) ?? 0,
    };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.updateTemplate',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { templateId: id },
    });
    throw error;
  }
}

// ============================================================================
// DELETE
// ============================================================================
export async function deleteTemplate(id: string): Promise<{ ok: true }> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { error } = await client.from('crm_email_templates').delete().eq('id', id);
    if (error) {
      throw new Error(`Failed to delete template: ${error.message}`);
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.deleteTemplate',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { templateId: id },
    });
    throw error;
  }
}

// ============================================================================
// DUPLICATE
// ============================================================================
// Copies a row verbatim (subject/body/format/merge_tags/category) under a new
// "<name> (copy)" name. The copy is never a default and starts at 0 uses.
export async function duplicateTemplate(id: string): Promise<CrmEmailTemplate> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    const { data: src, error: readErr } = await client
      .from('crm_email_templates')
      .select('name, subject, body, category, format, merge_tags')
      .eq('id', id)
      .single();
    if (readErr || !src) {
      throw new Error(`Failed to load template to duplicate: ${readErr?.message ?? 'not found'}`);
    }

    const source = src as Record<string, unknown>;
    const { data, error } = await client
      .from('crm_email_templates')
      .insert({
        name: `${(source.name as string) ?? 'Template'} (copy)`,
        subject: (source.subject as string) ?? '',
        body: (source.body as string) ?? '',
        category: (source.category as string) ?? 'general',
        format: normalizeFormat(source.format),
        merge_tags: (source.merge_tags as string[] | null) ?? null,
        is_default: false,
        usage_count: 0,
        created_by: user.id,
      })
      .select('id, name, subject, body, category, format, merge_tags, is_default, usage_count')
      .single();

    if (error) {
      throw new Error(`Failed to duplicate template: ${error.message}`);
    }

    const row = data as Record<string, unknown>;
    revalidatePath(CRM_REVALIDATE_PATH);
    return {
      id: row.id as string,
      name: row.name as string,
      subject: row.subject as string,
      body: row.body as string,
      category: row.category as TemplateCategory,
      format: normalizeFormat(row.format),
      merge_tags: (row.merge_tags as string[] | null) ?? null,
      is_default: (row.is_default as boolean | null) ?? false,
      usage_count: (row.usage_count as number | null) ?? 0,
    };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.duplicateTemplate',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { templateId: id },
    });
    throw error;
  }
}

// ============================================================================
// SET DEFAULT (closes G3)
// ============================================================================
// Single-default-per-category invariant: unset every other default in the
// category, then mark `id` as the default. Done as two writes (the table has
// no partial unique index to lean on); the unset is scoped to the category so
// a concurrent default in another category is never touched.
export async function setDefaultTemplate(
  id: string,
  category: TemplateCategory,
): Promise<CrmEmailTemplate> {
  try {
    const { supabase } = await getAuthedClient();
    const client = supabase as AnySupabase;

    // 1) Clear existing defaults in this category (skip the target row).
    const { error: clearErr } = await client
      .from('crm_email_templates')
      .update({ is_default: false })
      .eq('category', category)
      .eq('is_default', true)
      .neq('id', id);
    if (clearErr) {
      throw new Error(`Failed to clear existing default: ${clearErr.message}`);
    }

    // 2) Mark the target as default.
    const { data, error } = await client
      .from('crm_email_templates')
      .update({ is_default: true })
      .eq('id', id)
      .select('id, name, subject, body, category, format, merge_tags, is_default, usage_count')
      .single();
    if (error) {
      throw new Error(`Failed to set default template: ${error.message}`);
    }

    const row = data as Record<string, unknown>;
    revalidatePath(CRM_REVALIDATE_PATH);
    return {
      id: row.id as string,
      name: row.name as string,
      subject: row.subject as string,
      body: row.body as string,
      category: row.category as TemplateCategory,
      format: normalizeFormat(row.format),
      merge_tags: (row.merge_tags as string[] | null) ?? null,
      is_default: (row.is_default as boolean | null) ?? false,
      usage_count: (row.usage_count as number | null) ?? 0,
    };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.setDefaultTemplate',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { templateId: id, category },
    });
    throw error;
  }
}

// ============================================================================
// SEND TEST (closes G4)
// ============================================================================
// Sends ONE copy of the template to the logged-in admin (or an explicit
// `toEmail`) so the operator can preview the real rendering. We POST a single
// recipient to /api/admin/crm/send-email with the template's resolved format,
// so the test goes through the exact same shell/verbatim/text branch as a
// production send. Merge data comes from a representative sample coach (most
// complete row) so {first_name}/{school}/etc. render with real-looking values.
//
// The internal fetch forwards the caller's auth cookies so the route's
// admin gate passes; without that the route would 401.
export async function sendTestTemplate(input: {
  id: string;
  toEmail?: string;
}): Promise<{ ok: true; to: string }> {
  try {
    const { supabase, user } = await getAuthedClient();
    const client = supabase as AnySupabase;

    // 1) Load the template (subject/body/format).
    const { data: tpl, error: tplErr } = await client
      .from('crm_email_templates')
      .select('subject, body, format')
      .eq('id', input.id)
      .single();
    if (tplErr || !tpl) {
      throw new Error(`Failed to load template: ${tplErr?.message ?? 'not found'}`);
    }
    const template = tpl as { subject: string; body: string; format: string | null };

    // 2) Resolve the destination — explicit override, else the admin's email.
    const toEmail = (input.toEmail?.trim() || user.email || '').trim();
    if (!toEmail) {
      throw new Error('No destination email — pass toEmail or set an email on your account');
    }

    // 3) Pick a representative sample coach for merge data (a fully-populated row
    //    so the test renders with real-looking values). Fall back to the admin's
    //    own details when no coach data is available.
    const { data: sample } = await client
      .from('crm_coaches')
      .select('name, title, school, conference, division, program, team_size, current_software')
      .not('school', 'is', null)
      .not('conference', 'is', null)
      .or('is_archived.is.null,is_archived.eq.false')
      .order('priority', { ascending: false })
      .limit(1)
      .maybeSingle();

    const coach = (sample ?? null) as {
      name?: string | null;
      title?: string | null;
      school?: string | null;
      conference?: string | null;
      division?: string | null;
      program?: string | null;
      team_size?: number | null;
      current_software?: string | null;
    } | null;

    // The send route's Recipient contract — `id` is the merge identity. We use a
    // synthetic id (this is a one-off test, not a tracked coach send) so it never
    // collides with a real crm_coaches row or writes a misattributed contact log.
    const recipient = {
      id: `test-${user.id}`,
      email: toEmail,
      name: coach?.name ?? 'Coach Sample',
      title: coach?.title ?? 'Head Coach',
      school: coach?.school ?? 'State University',
      conference: coach?.conference ?? 'Atlantic Coast',
      division: coach?.division ?? 'D1',
      program: coach?.program ?? 'mens',
      team_size: coach?.team_size ?? 10,
      current_software: coach?.current_software ?? 'spreadsheets',
    };

    const format = normalizeFormat(template.format);

    // 4) POST to the internal send route with the caller's cookies forwarded so
    //    the route's auth.getUser() + admin check pass. Base URL mirrors
    //    task-reminders.ts.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://helmsportslabs.com';
    const cookieHeader = (await cookies()).toString();

    const res = await fetch(new URL('/api/admin/crm/send-email', baseUrl).toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: cookieHeader,
      },
      body: JSON.stringify({
        recipients: [recipient],
        subject: `[TEST] ${template.subject}`,
        body: template.body,
        format,
        // No templateId — a test must NOT bump the production usage_count.
      }),
    });

    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Test send failed (${res.status}): ${detail || 'unknown error'}`);
    }

    const result = (await res.json().catch(() => ({}))) as {
      sent?: number;
      failed?: number;
      skipped?: number;
    };
    if ((result.sent ?? 0) < 1) {
      throw new Error(
        `Test send did not deliver (sent=${result.sent ?? 0}, failed=${result.failed ?? 0}, skipped=${result.skipped ?? 0})`,
      );
    }

    return { ok: true, to: toEmail };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_templates.sendTestTemplate',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { templateId: input.id },
    });
    throw error;
  }
}
