/**
 * Extracts inline base64 images from a CRM email template, saves them to
 * `public/email/`, rewrites the template body to reference absolute URLs
 * on https://helmsportslabs.com, and writes the new body back to the DB.
 *
 * Why: the live "Editorial Launch v2 (HTML)" template was 102 KB — right at
 * Gmail's 102 KB clipping threshold — because its 4 images were inlined as
 * data:image/png;base64,... URIs. Inline data URIs also render unreliably
 * in Apple Mail iOS and the Gmail mobile app. Hosting the assets and using
 * absolute URLs drops the body well under any client's clip limit and makes
 * rendering consistent across mail clients.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/inline-email-images-to-public.ts \
 *     [--template-id <uuid>] [--dry-run]
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve as pathResolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATE_NAME = 'Editorial Launch v2 (HTML)';
const PUBLIC_BASE_URL = 'https://helmsportslabs.com';
const PUBLIC_SUBPATH = '/email';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = pathResolve(HERE, '..');
const PUBLIC_DIR = pathResolve(REPO_ROOT, 'public', 'email');

interface ImgMatch {
  full: string;
  src: string;
  alt: string;
  width?: string;
  height?: string;
  mime: string;
  base64: string;
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m?.[1];
}

function findImgTagsWithDataUri(body: string): ImgMatch[] {
  const out: ImgMatch[] = [];
  const re = /<img\s[^>]*?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const tag = m[0];
    const srcAttr = tag.match(/src="(data:image\/([a-zA-Z]+);base64,([^"]+))"/i);
    if (!srcAttr) continue;
    out.push({
      full: tag,
      src: srcAttr[1]!,
      alt: attr(tag, 'alt') ?? '',
      width: attr(tag, 'width'),
      height: attr(tag, 'height'),
      mime: srcAttr[2]!,
      base64: srcAttr[3]!,
    });
  }
  return out;
}

// Image roles for the Editorial Launch v2 template, ordered by appearance.
// alt text is mostly empty in the template, so name by semantic role + size
// instead of generic indices (avoids editorial-launch-2.jpg / -3.png noise).
const EDITORIAL_LAUNCH_ROLES = [
  'helm-sports-labs-mark', // 1: 32x32 header mark (alt="Helm Sports Labs")
  'editorial-hero',         // 2: 600px wide hero photo
  'editorial-pull-tile',    // 3: 56x56 square accent
  'editorial-feature',      // 4: 540px wide feature photo
] as const;

function slugFor(_alt: string, idx: number): string {
  return EDITORIAL_LAUNCH_ROLES[idx] ?? `editorial-launch-${idx + 1}`;
}

async function main() {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceKey) throw new Error('Missing SUPABASE env vars');

  const dryRun = process.argv.includes('--dry-run');
  const overrideId = process.argv.find((a) => a.startsWith('--template-id='))?.split('=')[1];

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const query = supabase
    .from('crm_email_templates')
    .select('id, name, body, format')
    .eq('format', 'html');
  const { data: rows, error } =
    overrideId
      ? await query.eq('id', overrideId)
      : await query.eq('name', TEMPLATE_NAME);

  if (error) throw error;
  if (!rows || rows.length === 0) throw new Error('Template not found');
  if (rows.length > 1) throw new Error(`Expected 1 template, got ${rows.length}`);

  const tpl = rows[0]! as { id: string; name: string; body: string; format: string };
  console.log(`Found template "${tpl.name}" (${tpl.id}), body=${tpl.body.length} bytes`);

  const matches = findImgTagsWithDataUri(tpl.body);
  console.log(`Found ${matches.length} <img> tag(s) with inline data URIs`);
  if (matches.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  if (!dryRun) await mkdir(PUBLIC_DIR, { recursive: true });

  let newBody = tpl.body;
  let totalBase64Chars = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const slug = slugFor(m.alt, i);
    const ext = m.mime === 'jpeg' ? 'jpg' : m.mime;
    const filename = `${slug}.${ext}`;
    const absUrl = `${PUBLIC_BASE_URL}${PUBLIC_SUBPATH}/${filename}`;
    const buf = Buffer.from(m.base64, 'base64');
    totalBase64Chars += m.base64.length;

    console.log(
      `  [${i + 1}/${matches.length}] alt="${m.alt}" ${m.width}x${m.height} mime=${m.mime} -> public/email/${filename} (${buf.length} bytes)`,
    );

    if (!dryRun) {
      await writeFile(pathResolve(PUBLIC_DIR, filename), buf);
    }

    const before = newBody.length;
    newBody = newBody.split(m.src).join(absUrl);
    if (newBody.length === before) {
      console.warn(`    ! src not replaced for image #${i + 1}`);
    }
  }

  console.log(
    `Body: ${tpl.body.length} -> ${newBody.length} bytes (saved ${tpl.body.length - newBody.length})`,
  );

  if (dryRun) {
    console.log('[dry run] Skipping DB write.');
    return;
  }

  const { error: updateErr } = await supabase
    .from('crm_email_templates')
    .update({ body: newBody })
    .eq('id', tpl.id);

  if (updateErr) throw updateErr;
  console.log(`Updated template ${tpl.id} in DB.`);
  console.log(`Total inline base64 stripped: ${totalBase64Chars} chars`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
