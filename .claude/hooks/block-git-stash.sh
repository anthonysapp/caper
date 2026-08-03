#!/bin/bash

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command')

# Block git stash mutations (pop/apply/drop/clear/push/save/bare "git stash").
# Read-only inspection (git stash list / show) stays allowed.
# Anchored to command positions (line start or after ; & | () so the phrase
# "git stash" inside quoted text (e.g. commit messages) doesn't false-positive.
if echo "$COMMAND" | grep -qE '(^|[;&|(][[:space:]]*)git[[:space:]]+stash' \
  && ! echo "$COMMAND" | grep -qE '(^|[;&|(][[:space:]]*)git[[:space:]]+stash[[:space:]]+(list|show)'; then
  echo "BLOCKED: '$COMMAND' — git stash is disabled in this repo. Multiple agents share this working tree; stashing clobbers their in-flight edits. Use a worktree for a clean baseline instead. (git stash list/show are allowed.)" >&2
  exit 2
fi

exit 0
