#!/usr/bin/env bash
set -euo pipefail

stage="$1"
sha="$2"
public_ip="$3"
[[ "$stage" =~ ^/tmp/bcm-release\.[A-Za-z0-9]{8}$ && "$sha" =~ ^[0-9a-f]{40}$ ]]
base=/opt/bcm-wa-scheduler
service=community-scheduler
compose=(docker compose --project-directory "$base"
  -f "$base/docker-compose.yml" -f "$base/compose.https.yml")
candidate="bcm-wa-scheduler-release:$sha"
target=bcm-wa-scheduler-community-scheduler:latest
rollback_required=false

healthy() {
  for _ in $(seq 1 24); do
    if curl -fsS --max-time 3 "http://127.0.0.1:3000/api/health" | grep -q '"ok":true' &&
       curl -fsS --max-time 3 --connect-to "$public_ip:443:127.0.0.1:443" \
         "https://$public_ip/api/health" | grep -q '"ok":true'; then
      return 0
    fi
    sleep 3
  done
  return 1
}

replace_container() {
  "${compose[@]}" up -d --no-deps --no-build --pull never --force-recreate "$service"
}

finish() {
  local status=$?
  if [[ "$rollback_required" == true ]]; then
    echo "Release failed. Reinstalling the previous application image."
    if docker image tag "$previous" "$target" && replace_container && healthy; then
      echo "Previous release is healthy."
    else
      echo "Could not verify the rollback."
    fi
    status=1
  fi
  docker image rm "$candidate" >/dev/null 2>&1 || true
  rm -rf -- "$stage"
  exit "$status"
}

# The lock covers the build, replacement, and any rollback.
cd "$base"
exec 9>.release.lock
flock -n 9
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

container=$("${compose[@]}" ps -q "$service")
[[ -n "$container" ]]
previous=$(docker inspect --format '{{.Image}}' "$container")
image_name=$(docker inspect --format '{{.Config.Image}}' "$container")
[[ "$image_name" == "${target%:latest}" || "$image_name" == "$target" ]]
mkdir "$stage/source"
tar -xzf "$stage/source.tar.gz" -C "$stage/source"
docker build --tag "$candidate" "$stage/source"
docker image tag "$previous" bcm-wa-scheduler-community-scheduler:previous

rollback_required=true
docker image tag "$candidate" "$target"
replace_container
healthy
rollback_required=false
echo "Release $sha is healthy."
