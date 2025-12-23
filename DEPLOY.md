# 🚀 Helm Sports Labs - Deployment Guide

## Recommended: Deploy to Vercel (Free)

Vercel made Next.js, so it's the easiest and fastest option.

---

## Step 1: Push to GitHub

First, get your code on GitHub:

```bash
cd /Users/ricknini/Downloads/helmv3

# Initialize git if not already
git init

# Add all files
git add .

# Commit
git commit -m "Production ready - Dec 2025"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/helm-sports-labs.git
git branch -M main
git push -u origin main
```

---

## Step 2: Deploy to Vercel

### Option A: One-Click (Easiest)

1. Go to [vercel.com](https://vercel.com)
2. Sign in with GitHub
3. Click **"Add New Project"**
4. Select your `helm-sports-labs` repo
5. Vercel auto-detects Next.js settings
6. Add environment variables (see below)
7. Click **Deploy**

### Option B: CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd /Users/ricknini/Downloads/helmv3
vercel

# Follow the prompts:
# - Link to existing project? No
# - What's your project name? helm-sports-labs
# - Which directory? ./
# - Override settings? No
```

---

## Step 3: Add Environment Variables

In Vercel Dashboard → Your Project → Settings → Environment Variables:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://dgvlnelygibgrrjehbyc.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key from Supabase |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` (update after first deploy) |
| `NEXT_PUBLIC_APP_NAME` | `Helm Sports Labs` |

**To get your Supabase keys:**
1. Go to [supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project
3. Settings → API
4. Copy "Project URL" and "anon public" key

---

## Step 4: Configure Supabase for Production

### Update Auth Redirect URLs

In Supabase Dashboard → Authentication → URL Configuration:

```
Site URL: https://your-app.vercel.app

Redirect URLs:
- https://your-app.vercel.app/**
- https://your-app.vercel.app/baseball/dashboard
- https://your-app.vercel.app/golf/dashboard
```

### Run the Production SQL

Go to Supabase → SQL Editor and run:
`supabase/production-setup.sql`

---

## Step 5: Custom Domain (Optional)

1. Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain (e.g., `helmsportslab.com`)
3. Update DNS records as instructed
4. Update `NEXT_PUBLIC_APP_URL` env var
5. Update Supabase redirect URLs

---

## Quick Commands Reference

```bash
# Build locally to check for errors
npm run build

# Deploy to production
vercel --prod

# Deploy preview (for testing)
vercel

# Check deployment logs
vercel logs
```

---

## Deployment Checklist

### Before Deploy
- [ ] Run `npm run build` locally (no errors)
- [ ] Run Supabase SQL script
- [ ] Test signup/login locally

### After Deploy
- [ ] Update Supabase redirect URLs
- [ ] Test signup on production
- [ ] Test coach onboarding
- [ ] Test player onboarding
- [ ] Verify all pages load

---

## Troubleshooting

### Build Fails
```bash
# Check for type errors
npm run typecheck

# Check for lint errors
npm run lint
```

### Auth Not Working
- Check Supabase redirect URLs include your Vercel domain
- Verify env variables are set correctly
- Check browser console for errors

### Pages 404
- Make sure all dynamic routes have proper fallbacks
- Check `next.config.js` for any issues

---

## Alternative Hosting Options

### Netlify
```bash
npm i -g netlify-cli
netlify deploy --prod
```

### Railway
1. Go to railway.app
2. New Project → Deploy from GitHub
3. Add env variables
4. Deploy

---

## Cost Estimate

| Service | Free Tier | Paid |
|---------|-----------|------|
| Vercel | 100GB bandwidth/mo | $20/mo Pro |
| Supabase | 500MB DB, 2GB storage | $25/mo Pro |
| Domain | - | $12/year |

**Total to start: $0** (free tiers are generous)
