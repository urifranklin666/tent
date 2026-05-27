#!/usr/bin/env bash
# tent — control-plane installer.
# Run on the box that will host the control plane. Must be run as root.
#
# What this does:
#   1. apt install baseline + postgres + ansible + cloudflared + jq + python3-passlib
#   2. install node 20 LTS via NodeSource + pnpm via npm
#   3. create the `tent` postgres role + database
#   4. generate /etc/tent/master.key (0600) if missing
#   5. write /etc/tent/env from ops/env.example if missing (and prompt you to fill it in)
#   6. pnpm install + build inside the checkout
#   7. generate + apply initial database migrations
#   8. install systemd unit files into /etc/systemd/system/
#   9. enable + start tent-worker (web/bot stay disabled until you configure their env)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TENT_USER="${TENT_USER:-deadplug}"
ETC_DIR="/etc/tent"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "install.sh must be run as root." >&2
  exit 1
fi

if ! id -u "$TENT_USER" >/dev/null 2>&1; then
  echo "operator user '$TENT_USER' does not exist. set TENT_USER=<existing-user> or create it first." >&2
  exit 1
fi

echo "── 1/9 apt install baseline packages ──"
apt-get update -y
apt-get install -y \
  curl ca-certificates gnupg lsb-release jq \
  postgresql postgresql-contrib \
  ansible \
  python3 python3-pip python3-passlib \
  git build-essential

echo "── 2/9 install node 20 LTS + pnpm ──"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v20.* ]]; then
  install -d /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
    > /etc/apt/sources.list.d/nodesource.list
  apt-get update -y
  apt-get install -y nodejs
fi
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@9
fi

echo "── 3/9 install cloudflared (for the control plane to tunnel its own web UI) ──"
if ! command -v cloudflared >/dev/null 2>&1; then
  curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg -o /usr/share/keyrings/cloudflare-main.gpg
  echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared $(lsb_release -cs) main" \
    > /etc/apt/sources.list.d/cloudflared.list
  apt-get update -y
  apt-get install -y cloudflared
fi

echo "── 4/9 postgres: tent role + db ──"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='tent'" | grep -q 1 || {
  TENT_DB_PASSWORD="$(openssl rand -base64 24)"
  sudo -u postgres psql <<SQL
CREATE ROLE tent LOGIN PASSWORD '${TENT_DB_PASSWORD}';
SQL
  echo "tent db password: ${TENT_DB_PASSWORD}"
  echo "TENT_DATABASE_URL=postgres://tent:${TENT_DB_PASSWORD}@127.0.0.1:5432/tent" > /tmp/tent-db-url.env
}
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='tent'" | grep -q 1 || {
  sudo -u postgres createdb -O tent tent
}

echo "── 5/9 /etc/tent/{env,master.key} ──"
install -d -m 0750 -o root -g "$TENT_USER" "$ETC_DIR"
if [[ ! -f "$ETC_DIR/master.key" ]]; then
  openssl rand -base64 32 > "$ETC_DIR/master.key"
  chmod 600 "$ETC_DIR/master.key"
  chown root:root "$ETC_DIR/master.key"
fi
if [[ ! -f "$ETC_DIR/env" ]]; then
  cp "$REPO_ROOT/ops/env.example" "$ETC_DIR/env"
  if [[ -f /tmp/tent-db-url.env ]]; then
    sed -i "s|^TENT_DATABASE_URL=.*|$(cat /tmp/tent-db-url.env)|" "$ETC_DIR/env"
    rm -f /tmp/tent-db-url.env
  fi
  chown root:"$TENT_USER" "$ETC_DIR/env"
  chmod 640 "$ETC_DIR/env"
  echo
  echo "wrote $ETC_DIR/env — edit it now to fill in Cloudflare + Discord + provider tokens"
  echo "  sudo -e $ETC_DIR/env"
  echo
  echo "then re-run: $0"
  exit 0
fi

echo "── 6/9 pnpm install + build ──"
cd "$REPO_ROOT"
sudo -u "$TENT_USER" pnpm install --frozen-lockfile || sudo -u "$TENT_USER" pnpm install
sudo -u "$TENT_USER" pnpm build || true

echo "── 7/9 generate + apply initial migrations ──"
# Sourcing the env so drizzle-kit can connect to postgres.
set -a
source "$ETC_DIR/env"
set +a
sudo -u "$TENT_USER" --preserve-env=TENT_DATABASE_URL \
  pnpm -F @tent/core exec drizzle-kit generate || true
sudo -u "$TENT_USER" --preserve-env=TENT_DATABASE_URL \
  pnpm -F @tent/core db:migrate

echo "── 8/9 install systemd units ──"
install -m 0644 "$REPO_ROOT/ops/systemd/tent-worker.service" /etc/systemd/system/tent-worker.service
install -m 0644 "$REPO_ROOT/ops/systemd/tent-web.service"    /etc/systemd/system/tent-web.service
install -m 0644 "$REPO_ROOT/ops/systemd/tent-bot.service"    /etc/systemd/system/tent-bot.service
systemctl daemon-reload

echo "── 9/9 enable + start the worker ──"
systemctl enable --now tent-worker
systemctl status tent-worker --no-pager || true

echo
echo "tent control plane installed."
echo "next:"
echo "  sudo -u $TENT_USER node $REPO_ROOT/apps/cli/dist/main.js init   # sanity check"
echo "  sudo -u $TENT_USER node $REPO_ROOT/apps/cli/dist/main.js server add"
echo
echo "the web UI + Discord bot units are installed but disabled — enable them after Phase 3/4 lands:"
echo "  systemctl enable --now tent-web tent-bot"
