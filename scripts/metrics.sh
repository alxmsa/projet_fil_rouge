#!/usr/bin/env bash
# Mesure les métriques demandées par la grille de notation, via docker compose
# (même mécanisme que la stack réelle, donc les variables d'env/réseau sont
# correctes) :
#   - taille de chaque image
#   - temps de build à froid et à chaud
#   - temps jusqu'à la première réponse HTTP
#   - nombre de couches de chaque Dockerfile
#
# Compatible avec le Bash 3.2 fourni par défaut sur macOS (pas de tableaux
# associatifs, pas de fonctionnalités Bash 4+).
#
# Prérequis : lancer ce script depuis la racine du repo, avec `db` déjà
# démarré et healthy (`docker compose up -d db`).
# Usage : ./scripts/metrics.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
RESULTS_FILE="$ROOT_DIR/METRICS.md"

# Charge .env pour que API_PORT/STATS_PORT reflètent ce que docker compose
# utilise réellement (sinon le script reste bloqué sur les valeurs par défaut).
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/.env"
  set +a
fi

now_ms() {
  # `date +%N` n'existe pas sur macOS (BSD date) : on passe par python3,
  # disponible partout, pour obtenir un timestamp en millisecondes portable.
  python3 -c 'import time; print(int(time.time() * 1000))'
}

echo "==> vérification que 'db' est en ligne (prérequis)"
docker compose up -d db >/dev/null
for _ in $(seq 1 30); do
  status=$(docker compose ps db --format '{{.Health}}' 2>/dev/null || echo "")
  if [ "$status" = "healthy" ]; then
    break
  fi
  sleep 1
done

build_time() {
  local service="$1"
  local start end
  start=$(now_ms)
  docker compose build "$service" >/tmp/build-"$service".log 2>&1
  end=$(now_ms)
  echo $((end - start))
}

image_size_human() {
  docker images "$1" --format '{{.Size}}'
}

layer_count() {
  docker inspect "$1" --format '{{len .RootFS.Layers}}'
}

ttfb() {
  local service="$1" url="$2"
  docker compose stop "$service" >/dev/null 2>&1 || true
  docker compose rm -f "$service" >/dev/null 2>&1 || true
  local start
  start=$(now_ms)
  docker compose up -d "$service" >/dev/null
  local i
  for i in $(seq 1 600); do   # jusqu'à 60s de marge
    if curl -sf -o /dev/null "$url"; then
      echo $(( $(now_ms) - start ))
      return
    fi
    sleep 0.1
  done
  echo "timeout"
}

measure_service() {
  local service="$1" image="$2" url="$3"

  echo "==> $service : purge du cache de build (mesure à froid)"
  docker builder prune -af >/dev/null

  local cold_ms warm_ms size layers ttfb_ms
  cold_ms=$(build_time "$service")
  warm_ms=$(build_time "$service")
  size=$(image_size_human "$image")
  layers=$(layer_count "$image")
  ttfb_ms=$(ttfb "$service" "$url")

  echo "| $image | $size | ${cold_ms}ms | ${warm_ms}ms | ${ttfb_ms}ms | $layers |" >> "$RESULTS_FILE"
  echo "    taille=$size froid=${cold_ms}ms chaud=${warm_ms}ms ttfb=${ttfb_ms}ms couches=$layers"
}

echo "# Mesures brutes ($(date -u +%Y-%m-%dT%H:%M:%SZ))" > "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"
echo "| Image | Taille | Build à froid | Build à chaud | TTFB | Couches |" >> "$RESULTS_FILE"
echo "|---|---|---|---|---|---|" >> "$RESULTS_FILE"

measure_service "api" "todo-api:local" "http://localhost:${API_PORT:-3000}/health"
measure_service "stats" "todo-stats:local" "http://localhost:${STATS_PORT:-5000}/health"

echo ""
echo "Résultats écrits dans $RESULTS_FILE — à recopier dans la section"
echo "'Tableau de métriques' du README. La stack reste up (docker compose ps)."
