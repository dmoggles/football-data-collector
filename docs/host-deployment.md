# TapLine host deployment and migration

This runbook provisions a Debian/Ubuntu host for the production and development deployments.
The application runs in Docker Compose. Host Nginx terminates TLS and proxies to frontend
containers bound only to localhost:

| Environment | Public host | Server directory | Local frontend port | Compose file |
| --- | --- | --- | --- | --- |
| Production | `tapline.football` / `www.tapline.football` | `~/tapline` | `127.0.0.1:8080` | `docker-compose.prod.yml` |
| Development | `dev.tapline.football` | `~/tapline-dev` | `127.0.0.1:8081` | `docker-compose.dev.yml` |

Replace the hostnames if DNS changes. Do not commit environment files, passwords, private keys,
database dumps, or uploaded media.

## 1. Prepare DNS and the host

Create `A`/`AAAA` records for the three hostnames above, pointing to the new server. During a
migration, lower DNS TTL in advance when possible.

Install Docker Engine and its Compose plugin using Docker's supported installation instructions.
Then install the host proxy and certificate tooling:

```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker nginx
docker compose version
```

Create the deployment directories as the same Unix user configured in GitHub Actions:

```bash
mkdir -p ~/tapline ~/tapline-dev
chmod 700 ~/tapline ~/tapline-dev
```

If the GHCR packages are private, authenticate that user with a GitHub token that has
`read:packages` permission:

```bash
docker login ghcr.io -u YOUR_GITHUB_USERNAME
```

Enter the token when prompted; do not place it on the command line.

## 2. Create environment files

Create `~/tapline/.env.prod` with unique production secrets:

```dotenv
APP_ENV=production
APP_DEBUG=false
MYSQL_HOST=mysql
MYSQL_PORT=3306
MYSQL_ROOT_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_ROOT_PASSWORD
MYSQL_DATABASE=tapline
MYSQL_USER=tapline_app
MYSQL_PASSWORD=REPLACE_WITH_A_LONG_RANDOM_APP_PASSWORD
MYSQL_TEST_DATABASE=tapline_test
SESSION_COOKIE_NAME=tapline_session
SESSION_EXPIRY_HOURS=24
SESSION_SECURE_COOKIES=true
```

Create `~/tapline-dev/.env.dev` with different passwords and cookie name:

```dotenv
APP_ENV=development
APP_DEBUG=false
MYSQL_HOST=mysql-dev
MYSQL_PORT=3306
MYSQL_ROOT_PASSWORD=REPLACE_WITH_A_DIFFERENT_RANDOM_ROOT_PASSWORD
MYSQL_DATABASE=tapline_dev
MYSQL_USER=tapline_app
MYSQL_PASSWORD=REPLACE_WITH_A_DIFFERENT_RANDOM_APP_PASSWORD
MYSQL_TEST_DATABASE=tapline_test
SESSION_COOKIE_NAME=tapline_dev_session
SESSION_EXPIRY_HOURS=24
SESSION_SECURE_COOKIES=true
```

Protect both files:

```bash
chmod 600 ~/tapline/.env.prod ~/tapline-dev/.env.dev
```

Compose uses these files both for `${...}` interpolation and as the backend environment. The
database hostnames must therefore match their Compose service names exactly.

## 3. Install the host Nginx sites

Copy the templates from this repository:

```bash
sudo cp infra/nginx/tapline-prod.conf.example /etc/nginx/sites-available/tapline
sudo cp infra/nginx/tapline-dev.conf.example /etc/nginx/sites-available/tapline-dev
sudo ln -s /etc/nginx/sites-available/tapline /etc/nginx/sites-enabled/tapline
sudo ln -s /etc/nginx/sites-available/tapline-dev /etc/nginx/sites-enabled/tapline-dev
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

The `Upgrade` and `Connection` headers in both templates are required for live-match WebSockets.
Without them, the backend receives an ordinary `GET /collection-sessions/.../ws` and returns 404.

Once DNS resolves to the host and ports 80/443 are open, obtain certificates:

```bash
sudo certbot --nginx -d tapline.football -d www.tapline.football
sudo certbot --nginx -d dev.tapline.football
sudo certbot renew --dry-run
```

Certbot adds the TLS listeners, certificate paths, and HTTP-to-HTTPS redirects to these site files.
Keep the proxy headers when reviewing Certbot's edits.

## 4. Configure GitHub environments

Create GitHub environments named `production` and `development`. Configure these secrets in each:

- `SSH_HOST`: server hostname or IP
- `SSH_PORT`: SSH port, normally `22`
- `SSH_USER`: Unix deployment user that owns the deployment directories
- `SSH_PRIVATE_KEY`: private key accepted by that user's `~/.ssh/authorized_keys`

The development workflow deploys every push to `main`. Production builds and deploys when a
GitHub release is published. The workflows copy the applicable Compose file, pull images, run
`alembic upgrade head`, and then recreate the backend and frontend services.

## 5. Initial deployment

GitHub Actions normally copies the Compose files. For a manual first deployment, copy
`docker-compose.prod.yml` to `~/tapline/` and `docker-compose.dev.yml` to `~/tapline-dev/`.

Production:

```bash
cd ~/tapline
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d mysql
docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend
```

Development:

```bash
cd ~/tapline-dev
docker compose -f docker-compose.dev.yml --env-file .env.dev pull
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d mysql-dev
docker compose -f docker-compose.dev.yml --env-file .env.dev run --rm backend alembic upgrade head
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d backend frontend
```

## 6. Verify a deployment

```bash
cd ~/tapline
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker logs tapline-backend --tail 100
curl --fail --show-error https://tapline.football/health

cd ~/tapline-dev
docker compose -f docker-compose.dev.yml --env-file .env.dev ps
docker logs tapline-dev-backend --tail 100
curl --fail --show-error https://dev.tapline.football/health
```

Check the installed WebSocket headers if live-session connections return HTTP 404:

```bash
sudo nginx -T 2>&1 | grep -n -B5 -A20 '8080\|8081'
docker exec tapline-frontend grep -n -E 'Upgrade|Connection' /etc/nginx/conf.d/default.conf
docker exec tapline-dev-frontend grep -n -E 'Upgrade|Connection' /etc/nginx/conf.d/default.conf
```

## 7. Back up persistent data

Create a private backup directory with sufficient free disk space:

```bash
install -d -m 700 ~/tapline-backups
```

Database backup:

```bash
docker exec tapline-mysql sh -c \
  'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers "$MYSQL_DATABASE"' \
  > ~/tapline-backups/tapline.sql
chmod 600 ~/tapline-backups/tapline.sql
```

Uploaded-media backup:

```bash
docker run --rm \
  -v tapline_uploaded_media:/source:ro \
  -v "$HOME/tapline-backups:/backup" \
  alpine tar -czf /backup/uploaded-media.tar.gz -C /source .
```

Confirm actual volume names with `docker volume ls`; Compose prefixes them using the project
directory name. Copy the backup files off-host and protect them as production data.

## 8. Move to a replacement host

1. Lower DNS TTL, provision the new host, and install Docker/Nginx/Certbot.
2. Create deployment directories and environment files using the same database credentials.
3. Copy the Compose files, database dump, and uploaded-media archive to the new host.
4. Start only MySQL and wait until it is healthy.
5. Restore the database before starting the backend.
6. Restore uploaded media into the new Compose volume.
7. Run `alembic upgrade head`, then start backend and frontend.
8. Install Nginx sites and certificates, verify health and a live WebSocket session, then update DNS.
9. Keep the old host stopped but recoverable until the new deployment has been verified.

Restoring overwrites the target database. Verify the target host and backup before running:

```bash
cd ~/tapline
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d mysql
docker exec -i tapline-mysql sh -c \
  'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' \
  < ~/tapline-backups/tapline.sql

docker run --rm \
  -v tapline_uploaded_media:/target \
  -v "$HOME/tapline-backups:/backup:ro" \
  alpine tar -xzf /backup/uploaded-media.tar.gz -C /target

docker compose -f docker-compose.prod.yml --env-file .env.prod run --rm backend alembic upgrade head
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d backend frontend
```

## 9. Routine diagnostics

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
docker logs tapline-backend --tail 100
docker logs tapline-dev-backend --tail 100
sudo nginx -t
sudo journalctl -u nginx --since '30 minutes ago'
```

Never use `docker compose down -v` on a host containing data: `-v` removes the database and
uploaded-media volumes.
