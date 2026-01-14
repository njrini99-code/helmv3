# Backup & Disaster Recovery Plan

**Last Updated:** December 2024
**Review Schedule:** Quarterly

---

## Executive Summary

This document outlines backup procedures, disaster recovery strategies, and business continuity plans for Helm Sports Labs.

**RTO (Recovery Time Objective):** < 4 hours
**RPO (Recovery Point Objective):** < 1 hour

---

## Data Classification

### Critical Data (Must backup)
- User accounts (`users`, `players`, `coaches`)
- Organization data (`organizations`, `teams`)
- Player profiles and metrics
- Coach-player relationships
- Messages and communication history
- Authentication data

### Important Data (Should backup)
- Player videos and media files
- Developmental plans
- Camp registrations
- Analytics data
- Audit logs

### Low Priority Data (Nice to backup)
- Session data
- Temporary files
- Cache data
- Log files (already in Sentry)

---

## Backup Strategy

### 1. Supabase Database Backups ✅

**Automatic Backups (Supabase):**
- **Frequency:** Daily automatic backups
- **Retention:** 7 days (Pro plan), 30 days (Team plan)
- **Type:** Full database dump
- **Storage:** Supabase infrastructure

**How to verify:**
1. Go to https://app.supabase.com/project/YOUR_PROJECT/database/backups
2. Check latest backup timestamp
3. Verify backup size is reasonable

**Manual Backup:**
```bash
# Using Supabase CLI
supabase db dump -f backup-$(date +%Y%m%d).sql

# Using pg_dump directly
pg_dump -h db.YOUR_PROJECT.supabase.co \
  -U postgres \
  -d postgres \
  -f backup-$(date +%Y%m%d).sql

# Restore from backup
psql -h db.YOUR_PROJECT.supabase.co \
  -U postgres \
  -d postgres \
  -f backup-20241215.sql
```

**Storage Locations:**
- Primary: Supabase (automated)
- Secondary: AWS S3 bucket (manual weekly)
- Tertiary: Local encrypted drive (monthly)

### 2. File Storage Backups (Supabase Storage)

**Automatic:**
- Supabase Storage is backed up with database
- Files stored in AWS S3 (Supabase backend)
- Redundant across multiple availability zones

**Manual Backup:**
```bash
# Download all files from a bucket
supabase storage download avatars/* ./backups/avatars/
supabase storage download videos/* ./backups/videos/

# Or using AWS CLI (if configured)
aws s3 sync s3://YOUR_BUCKET/avatars ./backups/avatars/
```

**Recommendations:**
- Critical media: Weekly manual backup to separate S3
- Archive old videos monthly to Glacier
- Keep local copies of irreplaceable content

### 3. Code Repository (GitHub)

**Already Protected:**
- ✅ Version control with Git
- ✅ Hosted on GitHub (redundant infrastructure)
- ✅ Protected main branch
- ✅ Required pull request reviews

**Additional Protection:**
```bash
# Create a complete backup of repo
git clone --mirror https://github.com/your-org/helm.git
tar -czf helm-backup-$(date +%Y%m%d).tar.gz helm.git

# Store in multiple locations:
# 1. External hard drive
# 2. Cloud storage (Google Drive, Dropbox)
# 3. Different Git provider (GitLab mirror)
```

### 4. Environment Variables

**Backup `.env.local` values:**
```bash
# Encrypt and backup
gpg -c .env.local
# This creates .env.local.gpg

# Store encrypted file in:
# 1. Password manager (1Password, Bitwarden)
# 2. Encrypted cloud storage
# 3. Offline secure location
```

**Never:**
- ❌ Commit .env to version control
- ❌ Store unencrypted in cloud
- ❌ Email env vars
- ❌ Share in Slack/Discord

---

## Disaster Recovery Scenarios

### Scenario 1: Database Corruption

**Detection:**
- Errors in Sentry
- User reports of data issues
- Failed queries in logs

**Recovery Steps:**
1. Immediately stop all write operations
2. Assess extent of corruption
3. Restore from most recent backup:
   ```bash
   supabase db reset --db-url YOUR_CONNECTION_STRING
   psql -h db.YOUR_PROJECT.supabase.co -U postgres -f backup.sql
   ```
4. Verify data integrity
5. Resume operations
6. Post-mortem analysis

**Expected Downtime:** 1-2 hours
**Data Loss:** < 24 hours (daily backups)

### Scenario 2: Supabase Outage

**Detection:**
- Health check failures
- Supabase status page alerts
- User unable to login/access data

**Immediate Actions:**
1. Check Supabase status: https://status.supabase.com
2. Communicate with users (status page)
3. If prolonged (>1 hour):
   - Spin up fallback database
   - Restore from latest backup
   - Update DNS/connection strings

**Failover Plan:**
```bash
# Option 1: Restore to new Supabase project
supabase projects create helm-failover
supabase db push --db-url NEW_PROJECT_URL

# Option 2: Restore to self-hosted PostgreSQL
docker run -d -p 5432:5432 \
  -e POSTGRES_PASSWORD=your-password \
  postgres:15
psql -h localhost -U postgres -f backup.sql
```

**Expected Downtime:** 2-4 hours
**Mitigation:** Multi-region setup (future)

### Scenario 3: Vercel Deployment Failure

**Detection:**
- Deployment fails in Vercel dashboard
- Site returns 500 errors
- Builds timing out

**Recovery Steps:**
1. Roll back to previous deployment:
   ```bash
   # Via Vercel dashboard:
   # Deployments → Previous deployment → Promote to Production
   ```
2. Or redeploy from known-good commit:
   ```bash
   vercel --prod
   ```
3. Investigate and fix issue
4. Redeploy

**Expected Downtime:** < 30 minutes
**Data Loss:** None (deployment doesn't affect database)

### Scenario 4: Security Breach

**Detection:**
- Unusual login patterns
- Sentry security alerts
- User reports unauthorized access

**Immediate Actions:**
1. **Contain:**
   - Rotate all API keys (Supabase, Sentry, etc.)
   - Force logout all users
   - Enable IP whitelist temporarily

2. **Investigate:**
   - Check Supabase logs
   - Review Sentry error logs
   - Analyze authentication attempts

3. **Recover:**
   - Restore from backup if data compromised
   - Reset affected user passwords
   - Enable MFA for all accounts

4. **Communicate:**
   - Notify affected users
   - File security incident report
   - Update security measures

**Expected Downtime:** 4-24 hours (depending on severity)

### Scenario 5: Accidental Data Deletion

**Detection:**
- User reports missing data
- Unexpected data absence in UI
- Database row count drops

**Recovery Steps:**
```sql
-- Check Supabase realtime subscriptions (if enabled)
-- Restore from point-in-time backup

-- If Supabase Pro plan:
-- 1. Go to Database → Backups → Point-in-time recovery
-- 2. Select timestamp before deletion
-- 3. Restore specific tables or entire database

-- If manual backup:
-- 1. Restore to temporary database
-- 2. Export affected data
-- 3. Import to production database
```

**Expected Downtime:** 1-2 hours
**Data Loss:** Minimal (point-in-time recovery)

---

## Backup Verification

### Monthly Verification Checklist

- [ ] Verify latest Supabase backup timestamp
- [ ] Test database restore on staging environment
- [ ] Verify file storage backup completeness
- [ ] Test code repository clone
- [ ] Verify environment variables are backed up
- [ ] Check backup storage capacity
- [ ] Review access logs for backup systems

### Quarterly Disaster Recovery Drill

**Scenario:** Complete database loss

**Steps:**
1. Provision new Supabase project
2. Restore database from backup
3. Restore file storage from backup
4. Deploy application to new environment
5. Run smoke tests
6. Verify data integrity
7. Document time taken and issues

**Success Criteria:**
- Complete restore in < 4 hours
- All critical functionality working
- < 1 hour data loss

---

## Backup Automation

### Recommended Script

```bash
#!/bin/bash
# backup.sh - Run daily via cron

DATE=$(date +%Y%m%d)
BACKUP_DIR="/secure/backups"
S3_BUCKET="s3://helm-backups"

# 1. Database backup
supabase db dump -f "${BACKUP_DIR}/db-${DATE}.sql"
gzip "${BACKUP_DIR}/db-${DATE}.sql"

# 2. Upload to S3
aws s3 cp "${BACKUP_DIR}/db-${DATE}.sql.gz" \
  "${S3_BUCKET}/database/" \
  --storage-class STANDARD_IA

# 3. File storage backup
supabase storage download avatars/* "${BACKUP_DIR}/avatars/"
supabase storage download videos/* "${BACKUP_DIR}/videos/"

# 4. Upload to S3
aws s3 sync "${BACKUP_DIR}/avatars/" "${S3_BUCKET}/avatars/"
aws s3 sync "${BACKUP_DIR}/videos/" "${S3_BUCKET}/videos/"

# 5. Clean up old backups (keep 30 days)
find "${BACKUP_DIR}" -name "db-*.sql.gz" -mtime +30 -delete

# 6. Send notification
curl -X POST https://your-webhook-url \
  -d "Backup completed: ${DATE}"
```

**Cron schedule:**
```cron
# Daily at 2 AM
0 2 * * * /path/to/backup.sh

# Weekly full backup (Sunday 3 AM)
0 3 * * 0 /path/to/full-backup.sh
```

---

## Cloud Storage Redundancy

### AWS S3 Backup Configuration

```bash
# Create S3 bucket with versioning
aws s3api create-bucket \
  --bucket helm-backups \
  --region us-east-1

aws s3api put-bucket-versioning \
  --bucket helm-backups \
  --versioning-configuration Status=Enabled

# Enable lifecycle policy (move to Glacier after 90 days)
aws s3api put-bucket-lifecycle-configuration \
  --bucket helm-backups \
  --lifecycle-configuration file://lifecycle.json
```

**lifecycle.json:**
```json
{
  "Rules": [
    {
      "Id": "ArchiveOldBackups",
      "Status": "Enabled",
      "Transitions": [
        {
          "Days": 90,
          "StorageClass": "GLACIER"
        }
      ],
      "Expiration": {
        "Days": 365
      }
    }
  ]
}
```

---

## Monitoring & Alerts

### Backup Health Checks

```bash
# Check latest backup
latest_backup=$(supabase db dump --dry-run)
if [ $? -ne 0 ]; then
  curl -X POST https://alerts-webhook \
    -d "Backup failed: $(date)"
fi

# Check backup age
backup_age_hours=$(( ($(date +%s) - $(stat -f %m latest-backup.sql)) / 3600 ))
if [ $backup_age_hours -gt 25 ]; then
  curl -X POST https://alerts-webhook \
    -d "Backup is ${backup_age_hours} hours old!"
fi
```

### Sentry Alerts

Configure alerts for:
- Database connection failures
- File storage errors
- Authentication system failures
- Unusual error spikes

---

## Business Continuity Plan

### Communication Plan

**Internal:**
- Slack: #incidents channel
- Email: tech@helmlab.com
- Phone: Emergency contact list

**External:**
- Status page: status.helmlab.com
- Twitter: @helmlab
- Email: support@helmlab.com
- In-app banner

### Escalation Path

1. **On-call Engineer** (0-15 min)
   - Acknowledge incident
   - Initial assessment
   - Start recovery procedures

2. **Tech Lead** (15-30 min)
   - Review recovery plan
   - Coordinate team
   - Communicate with stakeholders

3. **CTO** (30-60 min)
   - Major incident decision making
   - External communication approval
   - Resource allocation

4. **CEO** (60+ min)
   - Customer communication
   - Partner notification
   - Legal/PR involvement

### Stakeholder Contact List

```
Role              Name            Email                Phone
-----------------------------------------------------------------
On-call           TBD             oncall@helmlab.com   XXX-XXX-XXXX
Tech Lead         TBD             tech@helmlab.com     XXX-XXX-XXXX
CTO               TBD             cto@helmlab.com      XXX-XXX-XXXX
CEO               TBD             ceo@helmlab.com      XXX-XXX-XXXX
Supabase Support  N/A             support@supabase.io  Dashboard
Vercel Support    N/A             support@vercel.com   Dashboard
```

---

## Testing & Maintenance

### Monthly Tasks
- [ ] Verify automated backups ran successfully
- [ ] Test database restore on staging
- [ ] Review backup storage capacity
- [ ] Check backup system health

### Quarterly Tasks
- [ ] Full disaster recovery drill
- [ ] Review and update this document
- [ ] Test failover procedures
- [ ] Audit backup access logs
- [ ] Review RTO/RPO targets

### Annual Tasks
- [ ] Comprehensive security audit
- [ ] Update disaster recovery procedures
- [ ] Review and renew backup storage
- [ ] Team disaster recovery training
- [ ] Insurance policy review

---

## Quick Reference

### Emergency Contacts
- **Supabase Status:** https://status.supabase.com
- **Vercel Status:** https://vercel-status.com
- **Sentry:** https://status.sentry.io

### Quick Recovery Commands
```bash
# Restore database
psql -h HOST -U postgres -f backup.sql

# Deploy previous version
vercel --prod

# Roll back database migration
supabase migration repair --status reverted [migration-id]
```

---

## Compliance & Audit

### Backup Audit Log

**Required Documentation:**
- Backup schedules and retention policies
- Recovery time objectives (RTO)
- Recovery point objectives (RPO)
- Test results and drill reports
- Incident response reports

**Retention:**
- Backup logs: 1 year
- Drill reports: 3 years
- Incident reports: 7 years

---

## Summary Checklist

✅ **Daily:**
- Automated Supabase backups running
- Backup health checks passing

✅ **Weekly:**
- Manual backup to S3
- File storage sync

✅ **Monthly:**
- Backup verification testing
- Storage capacity review

✅ **Quarterly:**
- Disaster recovery drill
- Document updates

✅ **Annual:**
- Comprehensive audit
- Team training

---

**Last Reviewed:** December 2024
**Next Review:** March 2025
**Document Owner:** Tech Lead
