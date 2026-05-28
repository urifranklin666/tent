#!/usr/bin/env bash
# tent backup hook for the wordpress template.
# Called by packages/ansible/playbooks/site-backup.yml with:
#   SITE_SLUG     — the site slug (also the docker compose project name)
#   BACKUP_DIR    — directory to drop dumps into; tent tarballs the whole
#                   /var/lib/tent/sites/<slug> dir afterwards, so anything
#                   we write here ends up in the snapshot.

set -euo pipefail

if [[ -z "${SITE_SLUG:-}" || -z "${BACKUP_DIR:-}" ]]; then
  echo "backup.sh: SITE_SLUG and BACKUP_DIR must be set" >&2
  exit 1
fi

# Resolve the db container name. The compose file hardcodes tent-<slug>-db,
# so this is deterministic.
DB_CONTAINER="tent-${SITE_SLUG}-db"

if ! docker ps --format '{{.Names}}' | grep -qx "${DB_CONTAINER}"; then
  echo "backup.sh: ${DB_CONTAINER} not running; skipping mariadb dump" >&2
  exit 0
fi

# mariadb-dump --single-transaction gives a consistent snapshot of InnoDB
# tables without locking. The wordpress user owns the wordpress database.
docker exec "${DB_CONTAINER}" \
  mariadb-dump \
  --user=wordpress \
  --password="${WORDPRESS_DB_PASSWORD:-$(grep -m1 MARIADB_PASSWORD /var/lib/tent/sites/${SITE_SLUG}/docker-compose.yml | sed -E 's/.*"(.*)"/\1/')}" \
  --single-transaction \
  --routines \
  --triggers \
  wordpress \
  > "${BACKUP_DIR}/wordpress.sql"

echo "backup.sh: wrote ${BACKUP_DIR}/wordpress.sql"
