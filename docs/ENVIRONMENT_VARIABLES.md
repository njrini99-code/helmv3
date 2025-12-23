# Environment Variables Guide

This document explains all environment variables used in Helm Sports Labs.

## Quick Setup

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Fill in required values (marked as REQUIRED below)

3. Restart your development server

## Required Variables

### Supabase (Database & Auth)

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Where to find:**
1. Go to https://app.supabase.com
2. Select your project
3. Settings → API
4. Copy URL and keys

**Security:**
- `NEXT_PUBLIC_*` variables are exposed to the browser
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (never add `NEXT_PUBLIC_` prefix!)
- Service role key bypasses Row Level Security - only use in server-side code

### Application URL

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Production:** Set to your deployed URL (e.g., `https://helmlab.com`)
**Development:** Usually `http://localhost:3000`

### Sentry (Error Monitoring)

```env
NEXT_PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/your-project-id
SENTRY_ORG=your-org-name
SENTRY_PROJECT=your-project-name
SENTRY_AUTH_TOKEN=your-auth-token-here
```

**Setup:**
1. Create account at https://sentry.io
2. Create new project (select Next.js)
3. Copy DSN from project settings
4. Generate auth token: Settings → Account → API → Auth Tokens

**When to set:** Before deploying to production

## Optional Variables

### Development Mode

```env
NEXT_PUBLIC_DEV_MODE=false
```

**⚠️ WARNING:** Never set to `true` in production!
Enables quick access dashboards without authentication for development.

### Feature Flags

```env
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_ENABLE_CAMPS=true
NEXT_PUBLIC_ENABLE_MESSAGING=true
```

Enable/disable features without code changes. Useful for staged rollouts.

### Analytics

#### Google Analytics

```env
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

Get from: https://analytics.google.com

#### PostHog

```env
NEXT_PUBLIC_POSTHOG_KEY=phc_your-key-here
NEXT_PUBLIC_POSTHOG_HOST=https://app.posthog.com
```

Get from: https://posthog.com

### Email (Future)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=your-sendgrid-api-key
SMTP_FROM_EMAIL=noreply@helmlab.com
SMTP_FROM_NAME=Helm Sports Labs
```

**Providers:**
- SendGrid: https://sendgrid.com
- Resend: https://resend.com
- AWS SES: https://aws.amazon.com/ses/

### File Uploads

```env
UPLOADTHING_SECRET=sk_live_your-secret-key
UPLOADTHING_APP_ID=your-app-id
```

Get from: https://uploadthing.com

**Alternative:** Can use Supabase Storage directly (recommended)

### Payments (Future)

```env
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_your-key
STRIPE_SECRET_KEY=sk_live_your-key
STRIPE_WEBHOOK_SECRET=whsec_your-secret
```

Get from: https://stripe.com

## Environment-Specific Configurations

### Development (.env.local)

```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<local-dev-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_DEV_MODE=false
```

### Staging (.env.production)

```env
NEXT_PUBLIC_SUPABASE_URL=https://staging-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<staging-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<staging-service-key>
NEXT_PUBLIC_APP_URL=https://staging.helmlab.com
NEXT_PUBLIC_SENTRY_DSN=<sentry-dsn>
SENTRY_ORG=helm-sports-labs
SENTRY_PROJECT=helm-staging
```

### Production (.env.production)

```env
NEXT_PUBLIC_SUPABASE_URL=https://prod-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<production-service-key>
NEXT_PUBLIC_APP_URL=https://helmlab.com
NEXT_PUBLIC_SENTRY_DSN=<sentry-dsn>
SENTRY_ORG=helm-sports-labs
SENTRY_PROJECT=helm-production
```

## Deployment Platforms

### Vercel

1. Go to your project settings
2. Environment Variables tab
3. Add variables for each environment (Production, Preview, Development)
4. Redeploy for changes to take effect

**Auto-detected:**
- `NODE_ENV` (automatically set)
- `VERCEL_URL` (deployment URL)

### Railway

```bash
railway variables set NEXT_PUBLIC_SUPABASE_URL=your-url
railway variables set SUPABASE_SERVICE_ROLE_KEY=your-key
```

### Docker

Create `.env.production`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

Then in `docker-compose.yml`:
```yaml
services:
  app:
    env_file:
      - .env.production
```

## Security Best Practices

### ✅ DO:
- Use `.env.local` for local development
- Add `.env.local` to `.gitignore` (already done)
- Rotate secrets regularly
- Use different keys for staging vs production
- Use Vercel/Railway environment variables for deployments

### ❌ DON'T:
- Commit `.env.local` to version control
- Share service role keys
- Use `NEXT_PUBLIC_` prefix for sensitive data
- Hardcode secrets in code
- Reuse production keys in development

## Validating Environment Variables

Run this script to check your configuration:

```bash
npm run check-env
```

Or manually verify:

```bash
# Check required variables are set
[ -z "$NEXT_PUBLIC_SUPABASE_URL" ] && echo "Missing SUPABASE_URL" || echo "✓ SUPABASE_URL"
[ -z "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ] && echo "Missing ANON_KEY" || echo "✓ ANON_KEY"
[ -z "$SUPABASE_SERVICE_ROLE_KEY" ] && echo "Missing SERVICE_KEY" || echo "✓ SERVICE_KEY"
```

## Troubleshooting

### "Invalid API key" errors
- Check that anon key matches your Supabase project
- Ensure no extra spaces/newlines in `.env.local`
- Restart dev server after changing env vars

### Auth not working
- Verify `NEXT_PUBLIC_APP_URL` matches your actual URL
- Check Supabase Auth → URL Configuration → Site URL
- Ensure redirect URLs are configured in Supabase

### Sentry not capturing errors
- Check `NEXT_PUBLIC_SENTRY_DSN` is set
- Verify auth token has correct permissions
- Rebuild and redeploy (`npm run build`)

### Service role key exposed
- **NEVER** add `NEXT_PUBLIC_` prefix to service role key
- Check browser console - should not see service key
- Rotate the key immediately if exposed

## Migration from .env to .env.local

If you have an old `.env` file:

```bash
# Backup old file
mv .env .env.backup

# Copy example
cp .env.example .env.local

# Transfer values from backup to .env.local
# Then delete .env.backup
```

## Reference Links

- [Next.js Environment Variables](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables)
- [Supabase API Settings](https://supabase.com/docs/guides/api)
- [Sentry Next.js Setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Vercel Environment Variables](https://vercel.com/docs/projects/environment-variables)
