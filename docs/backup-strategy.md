# Database Backup Strategy — DesignArena

Scale context: single-event hackathon platform, PostgreSQL primary datastore. No existing backup automation as of Phase 11.

## Approach
Use `pg_dump` for logical backups — simplest, most portable, sufficient at this scale (per `PHASE_07_HANDOFF.md`'s own note that append-only tables like `LeaderboardSnapshot` are "fine for a single event hackathon"). Physical/continuous-archiving (WAL-based) backup is unnecessary complexity for this project's scale.

## Backup script
```bash
#!/usr/bin/env bash
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/hackathon"
FILENAME="hackathon_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

pg_dump "$DATABASE_URL" | gzip > "$BACKUP_DIR/$FILENAME"

# Retention: keep last 14 daily backups
find "$BACKUP_DIR" -name "hackathon_*.sql.gz" -mtime +14 -delete

echo "Backup complete: $BACKUP_DIR/$FILENAME"
```

Save as `infra/backup.sh`. Requires `pg_dump` client matching (or newer than) the server's major version (Postgres 16 per `docker-compose.dev.yml`).

## Scheduling
- **Local/staging**: run manually or via a cron entry (`0 2 * * * /path/to/backup.sh`) on whatever host runs the Postgres container.
- **Production** (once real hosting is chosen — not yet decided per this project's current state): most managed Postgres providers (RDS, Supabase, Neon, Railway) offer automated daily snapshots — prefer that over the script if available, since it also covers point-in-time recovery. Use the script above only if self-hosting Postgres via Docker in production.

## Retention policy
- 14 daily backups minimum, kept as compressed `.sql.gz`.
- Before any destructive admin action at scale (e.g. bulk user deletion, event archival with cascading deletes), take an ad-hoc backup first — do not rely solely on the schedule.

## Restore procedure
```bash
gunzip -c /backups/hackathon/hackathon_<TIMESTAMP>.sql.gz | psql "$DATABASE_URL"
```
**Always restore to a fresh/empty database, never directly over a live one**, to avoid partial-overwrite corruption. Verify row counts on key tables (`User`, `Event`, `Submission`, `Score`, `Evaluation`) post-restore before pointing the app at it.

## Not covered by this doc (deferred)
- Off-site/cross-region backup replication — revisit once actual production hosting is chosen.
- Automated restore-testing (periodically verifying a backup actually restores cleanly) — recommended once this moves past hackathon-scale usage.