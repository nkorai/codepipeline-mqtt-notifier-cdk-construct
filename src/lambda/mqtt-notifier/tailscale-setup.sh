#!/bin/sh
set -e
set -o pipefail

TAILSCALE_ROOT=/tmp/tailscale

# === Fetch secret with Node.js helper ===
if [ -n "$TAILSCALE_AUTH_KEY_SECRET_ARN" ]; then
  echo "[INFO] Fetching Tailscale auth key..."
  node /var/task/get-secret.mjs
  TS_AUTH_KEY=$(cat /tmp/tailscale-auth-key)
else
  echo "[INFO] No TAILSCALE_AUTH_KEY_SECRET_ARN set, skipping Tailscale"
  exit 0
fi

# Validate fetched key
if [ "$TS_AUTH_KEY" = "REPLACE_WITH_TAILSCALE_AUTHKEY" ] || [ -z "$TS_AUTH_KEY" ]; then
  echo "[ERROR] Tailscale auth key is invalid or missing"
  exit 1
fi

echo "[INFO] [Tailscale Setup] Starting tailscaled..."
/var/task/tailscaled \
  --tun=userspace-networking \
  --socks5-server=localhost:1055 \
  --state="$TAILSCALE_ROOT/tailscaled.state" \
  --statedir="$TAILSCALE_ROOT" \
  --socket="$TAILSCALE_ROOT/tailscaled.sock" \
  --verbose=1 &

# Wait for socket
for i in $(seq 1 20); do
  if [ -S "$TAILSCALE_ROOT/tailscaled.sock" ]; then
    echo "[INFO] [Tailscale Setup] Socket ready"
    break
  fi
  sleep 0.5
done

echo "[INFO] [Tailscale Setup] Running tailscale up..."
/var/task/tailscale --socket="$TAILSCALE_ROOT/tailscaled.sock" up \
  --auth-key="$TS_AUTH_KEY" \
  --hostname=mqtt-lambda \
  --accept-routes

if [ -n "$MQTT_DNS_SERVER" ]; then
  echo "[INFO] [Tailscale Setup] Overriding /etc/resolv.conf with $MQTT_DNS_SERVER"
  echo "nameserver $MQTT_DNS_SERVER" > /etc/resolv.conf
fi

echo "[INFO] [Tailscale Setup] Complete"
