# n8n Mac mini Setup for Helm Mission Control

> Purpose: run n8n locally on Nick's Mac mini as the automation layer for Helm Mission Control.
>
> n8n is not the partner dashboard. It is the wiring between GitHub, Huly, Vercel, Sentry, PostHog, Google Drive, Gmail, partner forms, and partner updates.

---

## 1. Core rule

The safe workflow is:

```text
Signal → triage → issue → safe-candidate gate → branch/PR → checks/review → Nick approval → deploy → timeline update
```

Do **not** build a workflow that silently changes production or auto-merges code.

---

## 2. First workflows to build

Build these first:

1. GitHub event to command-center timeline
2. Brain dump to clean GitHub issue
3. PR summary to partner-friendly update
4. Daily Helm CEO brief
5. Docs and roadmap consistency checker

The uploaded planning notes emphasize the same pattern: GitHub changes should flow through AI summarization into the command center and partner notifications, while brain dumps should become structured GitHub issues with acceptance criteria, priority, labels, relevant app area, and suggested modules.

---

## 3. Local folder structure

```bash
mkdir -p ~/helm-ops/n8n
cd ~/helm-ops/n8n
```

Recommended local files:

```text
~/helm-ops/n8n/
  docker-compose.yml
  .env
  backups/
  workflows/
  README.md
```

---

## 4. Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: n8n
    volumes:
      - postgres_data:/var/lib/postgresql/data

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    ports:
      - "5678:5678"
    environment:
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: n8n
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      GENERIC_TIMEZONE: America/New_York
      TZ: America/New_York
      N8N_HOST: ${N8N_HOST}
      N8N_PROTOCOL: https
      WEBHOOK_URL: ${WEBHOOK_URL}
      N8N_EDITOR_BASE_URL: ${N8N_EDITOR_BASE_URL}
      N8N_DIAGNOSTICS_ENABLED: "false"
      N8N_PERSONALIZATION_ENABLED: "false"
    depends_on:
      - postgres
    volumes:
      - n8n_data:/home/node/.n8n

volumes:
  postgres_data:
  n8n_data:
```

Create `.env` locally. Do not commit it:

```bash
POSTGRES_PASSWORD=replace-with-long-random-value
N8N_ENCRYPTION_KEY=replace-with-long-random-value
N8N_HOST=n8n.your-domain.com
WEBHOOK_URL=https://n8n.your-domain.com/
N8N_EDITOR_BASE_URL=https://n8n.your-domain.com/
```

Start:

```bash
docker compose up -d
```

Check:

```bash
docker compose ps
docker compose logs -f n8n
```

---

## 5. Access pattern

Preferred:

```text
Tailscale for private editor access
Cloudflare Tunnel for public webhooks
```

Rules:

- Partners should not access n8n.
- Expose webhook endpoints only when needed.
- Keep the editor private or strongly authenticated.
- Use scoped credentials.
- Back up the n8n database regularly.

---

## 6. Credentials to configure inside n8n

Create credentials for:

```text
GitHub
Huly
Google Drive
Gmail
Vercel
Sentry
PostHog
Supabase or Postgres read-only where possible
AI provider for summarization
```

Credential rules:

- Prefer read-only credentials for monitoring workflows.
- Use repo-scoped GitHub access where possible.
- Do not paste credentials into issues, Huly cards, PRs, comments, or Claude prompts.
- Store operational values in n8n credentials or environment variables.

---

## 7. Backup and maintenance

Weekly backup:

```bash
cd ~/helm-ops/n8n
docker compose exec postgres pg_dump -U n8n n8n > backups/n8n-$(date +%F).sql
```

Update n8n:

```bash
cd ~/helm-ops/n8n
docker compose pull
docker compose up -d
```

---

## 8. Done criteria

n8n is ready when:

- It runs after Mac mini restart.
- GitHub can reach a public webhook.
- The editor is private/protected.
- GitHub events create timeline entries.
- Partner intake can create GitHub issues.
- PRs generate partner summaries.
- No workflow auto-merges code.
