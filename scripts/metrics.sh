#!/usr/bin/env bash
# Mesure les métriques demandées par la grille de notation :
#   - taille de chaque image
#   - temps de build à froid et à chaud
#   - temps jusqu'à la première réponse HTTP
#   - nombre de couches de chaque Dockerfile
#
# Usage : ./scripts/metrics.sh
# Nécessite : docker, curl, bc. À exécuter à la racine du dépôt.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESULTS_FILE="$ROOT_DIR/METRICS.md"

declare -A CONTEXTS=(
  [todo-api]="$ROOT_DIR/api"
  [todo-stats]="$ROOT_DIR/stats-service"
)

now_ms() { date +%s%3N; }

build_time() {
  local image="$1" context="$2"
  local start end
  start=$(now_ms)
  docker build -t "$image:metrics" "$context" >/tmp/build-"$image".log 2>&1
  end=$(now_ms)
  echo $((end - start))
}

image_size_human() {
  docker images "$1:metrics" --format '{{.Size}}'
}

layer_count() {
  # Nombre de couches réellement empilées dans le RootFS de l'image finale,
  # plus fiable que `docker history | wc -l` (qui inclut les lignes <missing>
  # correspondant à des instructions sans nouvelle couche, ex. ENV/LABEL).
  docker inspect "$1:metrics" --format '{{len .RootFS.Layers}}'
}

ttfb() {
  local image="$1" port="$2" health_path="${3:-/health}"
  local container_id start elapsed
  container_id=$(docker run -d --rm -p "$port:$port" -e PORT="$port" "$image:metrics")
  start=$(now_ms)
  # On sonde jusqu'à obtenir un 200, timeout à 30s.
  for _ in $(seq 1 300); do
    if curl -sf -o /dev/null "http://127.0.0.1:$port$health_path"; then
      break
    fi
    sleep 0.1
  done
  elapsed=$(( $(now_ms) - start ))
  docker stop "$container_id" >/dev/null
  echo "$elapsed"
}

echo "# Mesures brutes ($(date -u +%Y-%m-%dT%H:%M:%SZ))" > "$RESULTS_FILE"
echo "" >> "$RESULTS_FILE"
echo "| Image | Taille | Build à froid | Build à chaud | TTFB | Couches |" >> "$RESULTS_FILE"
echo "|---|---|---|---|---|---|" >> "$RESULTS_FILE"

for image in "${!CONTEXTS[@]}"; do
  context="${CONTEXTS[$image]}"
  echo "==> $image : purge du cache de build (mesure à froid)"
  docker builder prune -af >/dev/null

  cold_ms=$(build_time "$image" "$context")
  warm_ms=$(build_time "$image" "$context")
  size=$(image_size_human "$image")
  layers=$(layer_count "$image")

  if [ "$image" = "todo-api" ]; then
    port=3999
    ttfb_ms=$(ttfb "$image" "$port" "/health")
  else
    port=5999
    ttfb_ms=$(ttfb "$image" "$port" "/health")
  fi

  echo "| $image | $size | ${cold_ms}ms | ${warm_ms}ms | ${ttfb_ms}ms | $layers |" >> "$RESULTS_FILE"
  echo "    taille=$size froid=${cold_ms}ms chaud=${warm_ms}ms ttfb=${ttfb_ms}ms couches=$layers"
done

echo ""
echo "Résultats écrits dans $RESULTS_FILE — à recopier dans la section"
echo "'Tableau de métriques' du README."
