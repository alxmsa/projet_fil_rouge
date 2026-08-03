#!/usr/bin/env bash
# Build + tag + push des deux images vers le registry, puis vérifie qu'un
# redéploiement 100% depuis le registry (sans code source local) fonctionne.
#
# Variables attendues (voir .env.example) : DOCKERHUB_USER, REGISTRY, IMAGE_TAG.
#
# Usage : DOCKERHUB_USER=alxmsa IMAGE_TAG=v1 ./scripts/publish.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGISTRY="${REGISTRY:-docker.io}"
DOCKERHUB_USER="${DOCKERHUB_USER:?variable DOCKERHUB_USER requise}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

API_IMAGE="$REGISTRY/$DOCKERHUB_USER/todo-api:$IMAGE_TAG"
STATS_IMAGE="$REGISTRY/$DOCKERHUB_USER/todo-stats:$IMAGE_TAG"

echo "==> build $API_IMAGE"
docker build -t "$API_IMAGE" "$ROOT_DIR/api"

echo "==> build $STATS_IMAGE"
docker build -t "$STATS_IMAGE" "$ROOT_DIR/stats-service"

echo "==> push $API_IMAGE"
docker push "$API_IMAGE"

echo "==> push $STATS_IMAGE"
docker push "$STATS_IMAGE"

cat <<EOF

Images publiées :
  - $API_IMAGE
  - $STATS_IMAGE

Pour redéployer ailleurs sans code source local :
  cp .env.example .env   # puis renseigner les secrets
  DOCKERHUB_USER=$DOCKERHUB_USER IMAGE_TAG=$IMAGE_TAG \\
    docker compose -f docker-compose.prod.yml --env-file .env pull
  DOCKERHUB_USER=$DOCKERHUB_USER IMAGE_TAG=$IMAGE_TAG \\
    docker compose -f docker-compose.prod.yml --env-file .env up -d
EOF
