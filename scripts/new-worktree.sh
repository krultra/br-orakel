#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Bruk: $0 <branch> <directory> [base]" >&2
  echo "Eksempel: $0 agent/frontend/calendar-list ../worktrees/calendar origin/main" >&2
  exit 1
fi

branch="$1"
directory="$2"
base="${3:-origin/main}"

git fetch origin
git worktree add "$directory" -b "$branch" "$base"
echo "Worktree opprettet i $directory på branch $branch"
echo "Neste steg: cd $directory && npm install"
