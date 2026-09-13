#!/usr/bin/env bash
# Headless Mac mini hardening: never sleep, come back after power loss,
# reachable over Tailscale as a system daemon, SSH always on.
#
# Run ON the Mac mini as an admin user:
#   sudo -v && bash scripts/ops/mac-mini-headless-hardening.sh
#
# Idempotent. Safe to re-run. See MAC_MINI_HEADLESS_RUNBOOK.md next to
# this file for the manual follow-ups it cannot do for you.
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "This script must run on the Mac mini itself." >&2
  exit 1
fi

log() { printf '\n==> %s\n' "$*"; }

log "Power: never sleep, wake for network, restart after power loss"
sudo pmset -a sleep 0 disablesleep 1 womp 1 autorestart 1 powernap 1 \
  ttyskeepawake 1
sudo pmset -a displaysleep 10 || true
# macOS 26.5+ on a 2024-or-later Mac mini: power on whenever power is
# (re)connected. Turns a smart plug into a remote hard-reboot button.
if sudo pmset -a autorestartatconnect 1 2>/dev/null; then
  echo "autorestartatconnect: enabled"
else
  echo "autorestartatconnect: unsupported here (needs macOS 26.5+); skipped"
fi

log "Remote Login (SSH) and Screen Sharing"
sudo systemsetup -setremotelogin on
sudo systemsetup -setcomputersleep Never || true
sudo launchctl enable system/com.apple.screensharing 2>/dev/null || true
sudo launchctl load -w \
  /System/Library/LaunchDaemons/com.apple.screensharing.plist 2>/dev/null || true

log "Tailscale as a root system daemon (survives sleep, logout, reboot)"
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is missing. Install it from https://brew.sh and re-run." >&2
  exit 1
fi
# The App Store / standalone GUI variants run inside the user session and
# stop when that session sleeps or logs out. Replace them with tailscaled.
if [[ -d /Applications/Tailscale.app ]]; then
  osascript -e 'quit app "Tailscale"' 2>/dev/null || true
  sudo rm -rf /Applications/Tailscale.app
  echo "Removed GUI Tailscale.app"
fi
brew list tailscale >/dev/null 2>&1 || brew install tailscale
sudo brew services start tailscale
sleep 3
# --ssh: Tailscale SSH keeps working even if sshd or the login session
# is broken. Prints a login URL if this node needs to re-authenticate.
sudo tailscale up --ssh --accept-dns=true
sudo tailscale set --auto-update=true || true

log "Verify"
pmset -g | grep -E 'sleep|womp|autorestart|powernap|disablesleep' || true
sudo systemsetup -getremotelogin
tailscale status --self=true --peers=false || tailscale status || true

cat <<'EOF'

Done. Manual follow-ups that cannot be scripted:
  1. System Settings > Wi-Fi > your network (i) > Private Wi-Fi Address:
     Off. A stable MAC keeps the router reservation and Wake-on-LAN valid.
  2. System Settings > Users & Groups > Automatic login: your account.
     Requires FileVault OFF. For a headless box either turn FileVault off
     (Privacy & Security) or stay on macOS 26.5+ where FileVault can be
     unlocked over SSH.
  3. Prefer Ethernet over Wi-Fi. Wired Wake-on-LAN needs no Apple TV.
  4. Put a Wi-Fi smart plug on the power cord. With autorestartatconnect
     on, toggling the plug is a remote hard reboot from anywhere.
  5. Spectrum app: delete the temporary port forwards and turn Security
     Shield back on.
EOF
