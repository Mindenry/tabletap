# Backups and restore

PostgreSQL is the source of truth. Take a logical backup with `pg_dump` through
the Compose service, keep several days, and copy the archives off the machine.

## Take a backup

```bash
pnpm backup
```

The script runs:

```bash
docker compose exec -T postgres pg_dump -U tabletap -d tabletap --format=custom --no-owner
```

and writes `backups/tabletap-<UTC stamp>.dump.gz` (gzip level 9). It keeps the
last `BACKUP_KEEP` archives (default 14) and deletes older ones.

Environment overrides: `POSTGRES_USER`, `POSTGRES_DB`, `BACKUP_DIR`,
`BACKUP_KEEP`.

## Restore

> This **replaces** the current database. Stop the API first and tell staff.

```bash
pnpm restore backups/tabletap-2026-11-26T06-51-31.dump.gz
```

The script decompresses the archive and runs `pg_restore --clean --if-exists
--no-owner` inside the `postgres` container.

After a restore:

1. Start the API and check `GET /api/v1/health/ready`.
2. Sign in and open the dashboard; the totals should match the backup date.
3. Re-issue QR codes only if the restore moved to a different `WEB_URL`.

## Schedule

Windows Task Scheduler (nightly at 03:00):

```powershell
$action = New-ScheduledTaskAction -Execute "node.exe" `
  -Argument "E:\Code\tabletap\scripts\backup.mjs" `
  -WorkingDirectory "E:\Code\tabletap"
$trigger = New-ScheduledTaskTrigger -Daily -At 03:00
Register-ScheduledTask -TaskName "TableTap backup" -Action $action -Trigger $trigger -RunLevel Highest
```

Linux cron:

```cron
0 3 * * * cd /srv/tabletap && /usr/bin/node scripts/backup.mjs >> /var/log/tabletap-backup.log 2>&1
```

Copy the `backups/` folder to another machine or object storage; a backup on the
same disk as the database is not a backup.

## What is not covered

- Object storage for menu images (uploads are URLs today).
- Redis contents (queues/cache are disposable; nothing authoritative lives there).
- Point-in-time recovery. For that, enable WAL archiving in PostgreSQL.
