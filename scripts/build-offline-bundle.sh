#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-$ROOT/dist/offline-bundle}"

echo "Building application artifacts..."
cd "$ROOT"
npm ci
npm run build
npm run build -w @intandms/web

mkdir -p "$OUT/images" "$OUT/compose" "$OUT/docs"
cp -a "$ROOT/infra/compose/docker-compose.yml" "$OUT/compose/"
cp -a "$ROOT/infra/compose/nginx" "$OUT/compose/" 2>/dev/null || true
cp -a "$ROOT/.env.example" "$OUT/compose/.env.example"
cp -a "$ROOT/docs/ON_PREMISE_DEPLOYMENT.md" "$OUT/docs/"

echo "Saving docker images (requires docker build first)..."
for svc in api worker web; do
  docker build -f "$ROOT/infra/docker/Dockerfile.$svc" -t "intandmsv2-$svc:local" "$ROOT"
  docker save "intandmsv2-$svc:local" -o "$OUT/images/intandmsv2-$svc.tar"
done

echo "Offline bundle staged at: $OUT"
echo "Verify checksums and sign manifest before customer handoff."
