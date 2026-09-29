#!/usr/bin/env bash
# publish.sh — publish ureport-mocha-reporter to npm
# Usage:
#   ./publish.sh             — publish current version
#   ./publish.sh patch       — bump patch version, then publish
#   ./publish.sh minor       — bump minor version, then publish
#   ./publish.sh major       — bump major version, then publish
#   ./publish.sh --dry-run   — run everything except the actual publish

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

DRY_RUN=false
BUMP=""

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    patch|minor|major) BUMP="$arg" ;;
    *)
      echo "Unknown argument: $arg"
      echo "Usage: $0 [patch|minor|major] [--dry-run]"
      exit 1
      ;;
  esac
done

echo "==> Checking npm login..."
npm whoami || { echo "ERROR: not logged in to npm. Run 'npm login' first."; exit 1; }

if [[ -n "$BUMP" ]]; then
  echo "==> Bumping $BUMP version..."
  npm version "$BUMP" --no-git-tag-version
fi

VERSION=$(node -p "require('./package.json').version")
echo "==> Publishing version $VERSION (prepublishOnly will run tests + build)..."

if $DRY_RUN; then
  echo "    [DRY RUN] would run: npm publish --access public"
  npm pack --dry-run
else
  npm publish --access public
  echo "==> Published ureport-mocha-reporter@$VERSION"
fi
