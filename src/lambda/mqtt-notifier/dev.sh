#!/bin/bash
set -euo pipefail

IMAGE_NAME="mqttnotifierfunction"
FUNC_NAME="MqttNotifierFunction"
ENV_FILE="env.json"
EVENT_FILE="event.json"
VERSION_TAG="v$(date +%Y%m%d-%H%M%S)"

echo "🧼 Cleaning .aws-sam..."
rm -rf .aws-sam
rm -rf ~/.aws-sam

echo "🔥 Removing old Docker images..."
docker rmi --force "$IMAGE_NAME:latest" || true
docker rmi --force "$IMAGE_NAME:rapid-x86_64" || true

echo "🐳 Building Docker image (no cache)..."
docker build --no-cache -t "$IMAGE_NAME:latest" .

echo "🔨 Running SAM build..."
sam build --use-container --no-cached --debug

echo "🧪 Invoking $FUNC_NAME with version: $VERSION_TAG"
sam local invoke "$FUNC_NAME" \
  --env-vars "$ENV_FILE" \
  --event "$EVENT_FILE" \
  --docker-network host
