# SlotEase: Hostinger VPS Deployment

One-time setup for an Ubuntu 22.04/24.04 Hostinger VPS. Afterwards every push to `main`
deploys automatically through `.github/workflows/deploy.yml`.

## 1. DNS

In your DNS panel (Hostinger hPanel or your registrar), create:

| Type | Name  | Value         |
|------|-------|---------------|
| A    | `@`   | `<VPS_IP>`    |
| A    | `www` | `<VPS_IP>`    |

Wait until `dig +short yourdomain.com` returns the VPS IP.

## 2. Server basics + Docker

```bash
ssh root@<VPS_IP>
apt update && apt upgrade -y
adduser deploy && usermod -aG sudo deploy

# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Add the public half of the GitHub Actions deploy key to `/home/deploy/.ssh/authorized_keys`.

## 3. Clone + server `.env`

```bash
sudo mkdir -p /opt/slotease && sudo chown deploy:deploy /opt/slotease
su - deploy
git clone <repo-url> /opt/slotease
cd /opt/slotease
cp .env.example .env
chmod 600 .env
nano .env
```

Set production values. At minimum:

- `DOMAIN`, `CERTBOT_EMAIL`
- `POSTGRES_USER`, `POSTGRES_PASSWORD` (strong, random), `POSTGRES_DB`
- `SECRET_KEY`: `openssl rand -hex 32`
- `TOKEN_ENCRYPTION_KEY`: a Fernet key (see the comment in `.env.example`)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_ENVIRONMENT=test_mode` (switch to live only at launch)
- `SMTP_*`, `EMAIL_FROM`

`DATABASE_URL`, `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS`, the Google redirect URIs and
`VITE_*` are derived from `DOMAIN` in `docker-compose.prod.yml`.

## 4. First TLS certificate

nginx cannot start without a certificate, so issue the first one in standalone mode
(port 80 must be free):

```bash
cd /opt/slotease
set -a; . ./.env; set +a
docker compose -f docker-compose.prod.yml run --rm -p 80:80 --entrypoint certbot certbot \
  certonly --standalone -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email
```

Renewals are handled by the `certbot` service (webroot, every 12h).

## 5. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -fsS https://$DOMAIN/health
```

Migrations (`alembic upgrade head`) run automatically when the backend container starts.
Only the single `scheduler` container runs background jobs.

## 6. Cron: backups + nginx reload after renewals

```bash
chmod +x /opt/slotease/deploy/backup.sh
sudo touch /var/log/slotease-backup.log && sudo chown deploy /var/log/slotease-backup.log
sudo mkdir -p /var/backups/slotease && sudo chown deploy /var/backups/slotease
crontab -e
```

```cron
0 3 * * * /opt/slotease/deploy/backup.sh >> /var/log/slotease-backup.log 2>&1
0 4 * * * cd /opt/slotease && docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload
```

Backups land in `/var/backups/slotease` (7 days kept). Restore:

```bash
gunzip -c /var/backups/slotease/slotease_<ts>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

Copy backups off the server too (Hostinger snapshots or `rsync` to object storage).

## 7. External services

**Dodo Payments** (dashboard, then Webhooks):

- Webhook URL: `https://DOMAIN/api/payments/dodo/webhook`
- Copy the signing secret into `DODO_WEBHOOK_SECRET`, then run `docker compose -f docker-compose.prod.yml up -d`.

**Google Cloud Console** (APIs & Services, then Credentials, then your OAuth client):

- Authorized JavaScript origins: `https://DOMAIN`
- Authorized redirect URIs:
  - `https://DOMAIN/auth/google/callback`
  - `https://DOMAIN/api/calendar/google/callback`
- Calendar push notifications need the domain verified in Google Search Console.

## 8. GitHub Actions secrets

Repository Settings, then Secrets and variables, then Actions (environment `production`):

| Secret        | Value                                   |
|---------------|-----------------------------------------|
| `VPS_HOST`    | VPS IP or hostname                      |
| `VPS_USER`    | `deploy`                                |
| `VPS_SSH_KEY` | Private key matching the authorized key |

The VPS needs read access to the repository (a deploy key in `~/.ssh` or an HTTPS token)
so that `git pull` works.

## Useful commands

```bash
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f scheduler
docker compose -f docker-compose.prod.yml exec backend alembic current
docker compose -f docker-compose.prod.yml restart nginx
```
