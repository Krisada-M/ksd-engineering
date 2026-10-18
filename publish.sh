#!/usr/bin/env bash
set -euo pipefail

# Non-destructive first publication to the user's empty public repository.
REPO="https://github.com/Krisada-M/ksd-engineering-.git"
cd "$(dirname "$0")"

for cmd in git node; do
  command -v "$cmd" >/dev/null || { echo "Missing $cmd" >&2; exit 1; }
done

node --test plugins/engineering-proxy/test/*.test.js

if [[ -d .git ]]; then
  echo "Refusing to publish over an existing .git checkout; inspect it manually." >&2
  exit 1
fi
if [[ -z "$(git config user.name || true)" || -z "$(git config user.email || true)" ]]; then
  echo "Set git config user.name and user.email first." >&2
  exit 1
fi
if ! remote_refs="$(git ls-remote --heads "$REPO")"; then
  echo "Cannot access GitHub. Authenticate git/gh for this account first." >&2
  exit 1
fi
if [[ -n "$remote_refs" ]]; then
  echo "Remote already has commits. No force push/overwrite. Inspect and merge manually." >&2
  exit 1
fi

git init -b main
git remote add origin "$REPO"
git add .
git commit -m "feat: bootstrap OMP engineering proxy with Ponytail compatibility"
git push -u origin main
echo "Published to https://github.com/Krisada-M/ksd-engineering-"
