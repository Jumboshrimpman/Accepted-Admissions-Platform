#!/usr/bin/env sh

set -u

if ! env -u PORT -u BASE_PATH pnpm run typecheck; then
  echo "Build check failed during workspace typecheck." >&2
  exit 1
fi

for package in \
  "@workspace/api-server" \
  "@workspace/accepted-admissions" \
  "@workspace/mockup-sandbox"
do
  echo "Building ${package} without PORT or BASE_PATH..."
  if ! env -u PORT -u BASE_PATH pnpm --filter "${package}" run build; then
    echo "Build failed for artifact ${package} with PORT and BASE_PATH unset." >&2
    exit 1
  fi
done