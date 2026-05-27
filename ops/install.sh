#!/usr/bin/env bash
# Bootstrap script for the tent control plane itself.
# Run on the box that will host the control plane (typically the same box this checkout lives on).
# Must be run as root.
#
# Phase 0: this script is a stub. Full implementation lands in Phase 1, which will:
#   - apt install postgresql cloudflared ansible jq
#   - install pnpm + node 20 LTS
#   - createuser tent && createdb tent
#   - generate /etc/tent/master.key (0600)
#   - install systemd units to /etc/systemd/system/
#   - pnpm install && pnpm build
#   - prompt for env values, write /etc/tent/env (0640)
#   - systemctl enable --now tent-web tent-bot tent-worker
#
# For now: just exit with a clear message.

set -euo pipefail

echo "tent install.sh — not yet implemented (Phase 1 deliverable)"
echo "Phase 0 only sets up the repo scaffolding."
exit 1
