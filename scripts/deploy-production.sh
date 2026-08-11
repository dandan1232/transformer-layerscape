#!/usr/bin/env bash

set -Eeuo pipefail

readonly APP_ROOT='/home/ubuntu/transformer-layerscape'
readonly DEPLOY_CONTEXT="${APP_ROOT}/deploy-context"
readonly COMPOSE_FILE="${APP_ROOT}/docker-compose.yml"
readonly ENV_FILE="${APP_ROOT}/.env"
readonly SERVICE_CONTAINER='transformer-layerscape-web-1'
readonly IMAGE_REPOSITORY='transformer-layerscape'
readonly RUNTIME_BASE_IMAGE='transformer-layerscape:runtime-base'
readonly APP_PORT='8080'

if [[ $# -ne 1 || ! $1 =~ ^[0-9a-f]{40}$ ]]; then
  echo 'Usage: deploy-production.sh <40-character commit SHA>' >&2
  exit 64
fi

readonly COMMIT_SHA="$1"
readonly SHORT_SHA="${COMMIT_SHA:0:12}"
readonly NEW_IMAGE="${IMAGE_REPOSITORY}:${COMMIT_SHA}"
readonly ROLLBACK_IMAGE="${IMAGE_REPOSITORY}:rollback"
readonly CANDIDATE_CONTAINER="transformer-layerscape-candidate-${SHORT_SHA}"

cleanup() {
  docker rm -f "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for command in curl docker; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command is unavailable: ${command}" >&2
    exit 69
  fi
done

mkdir -p "$APP_ROOT"

for deployment_file in Dockerfile.runtime nginx.conf compose.yaml dist/index.html; do
  if [[ ! -f "${DEPLOY_CONTEXT}/${deployment_file}" ]]; then
    echo "Deployment context is missing ${deployment_file}." >&2
    exit 66
  fi
done

if ! docker image inspect "$RUNTIME_BASE_IMAGE" >/dev/null 2>&1; then
  echo "Runtime base image is missing: ${RUNTIME_BASE_IMAGE}" >&2
  exit 66
fi

echo "Building ${NEW_IMAGE} from the synchronized production bundle"
docker build \
  --file "${DEPLOY_CONTEXT}/Dockerfile.runtime" \
  --tag "$NEW_IMAGE" \
  "$DEPLOY_CONTEXT"

echo 'Checking the new image before replacing production'
docker run \
  --detach \
  --name "$CANDIDATE_CONTAINER" \
  --health-cmd='wget -q -O /dev/null http://127.0.0.1/ || exit 1' \
  --health-interval=2s \
  --health-timeout=3s \
  --health-retries=20 \
  --health-start-period=2s \
  "$NEW_IMAGE" >/dev/null

candidate_healthy='false'
for _ in $(seq 1 30); do
  candidate_status="$(docker inspect --format '{{.State.Health.Status}}' "$CANDIDATE_CONTAINER")"
  if [[ "$candidate_status" == 'healthy' ]]; then
    candidate_healthy='true'
    break
  fi
  if [[ "$candidate_status" == 'unhealthy' ]]; then
    break
  fi
  sleep 2
done

if [[ "$candidate_healthy" != 'true' ]]; then
  docker logs "$CANDIDATE_CONTAINER" >&2 || true
  echo 'Candidate image did not become healthy; production was not changed.' >&2
  exit 1
fi
docker rm -f "$CANDIDATE_CONTAINER" >/dev/null

previous_image_id=''
if docker inspect "$SERVICE_CONTAINER" >/dev/null 2>&1; then
  previous_image_id="$(docker inspect --format '{{.Image}}' "$SERVICE_CONTAINER")"
  docker tag "$previous_image_id" "$ROLLBACK_IMAGE"
fi

if [[ -f "$COMPOSE_FILE" ]]; then
  cp "$COMPOSE_FILE" "${COMPOSE_FILE}.rollback"
fi
if [[ -f "$ENV_FILE" ]]; then
  cp "$ENV_FILE" "${ENV_FILE}.rollback"
else
  rm -f "${ENV_FILE}.rollback"
fi

install -m 0644 "${DEPLOY_CONTEXT}/compose.yaml" "${COMPOSE_FILE}.next"
printf 'APP_IMAGE=%s\nAPP_PORT=%s\n' "$NEW_IMAGE" "$APP_PORT" > "${ENV_FILE}.next"
mv "${COMPOSE_FILE}.next" "$COMPOSE_FILE"
mv "${ENV_FILE}.next" "$ENV_FILE"

rollback() {
  echo 'Production health check failed; restoring the previous image.' >&2
  if [[ -f "${COMPOSE_FILE}.rollback" ]]; then
    cp "${COMPOSE_FILE}.rollback" "$COMPOSE_FILE"
  fi
  if [[ -f "${ENV_FILE}.rollback" ]]; then
    cp "${ENV_FILE}.rollback" "$ENV_FILE"
  elif [[ -n "$previous_image_id" ]]; then
    printf 'APP_IMAGE=%s\nAPP_PORT=%s\n' "$ROLLBACK_IMAGE" "$APP_PORT" > "$ENV_FILE"
  fi
  docker compose --project-directory "$APP_ROOT" --file "$COMPOSE_FILE" up \
    --detach --no-build --force-recreate --wait --wait-timeout 90
}

if ! docker compose --project-directory "$APP_ROOT" --file "$COMPOSE_FILE" up \
  --detach --no-build --force-recreate --wait --wait-timeout 90; then
  rollback
  exit 1
fi

if ! curl --fail --silent --show-error --max-time 15 "http://127.0.0.1:${APP_PORT}/" >/dev/null; then
  rollback
  exit 1
fi

echo "Deployment complete: ${COMMIT_SHA}"
