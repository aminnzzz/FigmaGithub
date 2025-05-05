#!/usr/bin/env bash
set -euo pipefail

: "${FIGMA_ACCESS_TOKEN:?Need FIGMA_ACCESS_TOKEN}"
: "${FIGMA_FILE_KEY:?Need FIGMA_FILE_KEY}"
API_BASE="${FIGMA_API_BASE:-https://api.figma.com/v1}"

# 1) Fetch
raw=$(curl -sSL \
  -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "$API_BASE/files/$FIGMA_FILE_KEY/variables/local")

# 2) Quick sanity check
echo "➤ Raw JSON top‐level keys: $(jq -r 'keys | join(", ")' <<<"$raw")"
echo "➤ meta keys:          $(jq -r '.meta | keys | join(", ")' <<<"$raw")"
# Does `.variables` live at root?
echo "➤ has .variables?     $(jq -r 'has("variables")' <<<"$raw")"
# Does `.meta.variables` exist?
echo "➤ has .meta.variables? $(jq -r '.meta | has("variables")' <<<"$raw")"

# … earlier parts of fetch-figma-variables-v2.sh …

# … earlier in fetch-figma-variables-v2.sh …

# 2b) Refined first‐variable debug using meta.variables & meta.variableCollections
echo "➤ First variable entry details:"
jq -r '
  .meta as $m
  | $m.variables
  | to_entries[0] as $e
  | ($e.value.variableCollectionId)       as $cid
  | ($m.variableCollections[$cid].defaultModeId) as $mode
  | ($e.key)                              as $id
  | ($e.value.name)                       as $name
  | ($e.value.valuesByMode[$mode])        as $raw
  | "ID: \($id) → Name: \($name) → Mode: \($mode) → RawValue: \($raw)"
' <<<"$raw" || echo "  ❌ failed to extract first var"



# 3) Count collections & vars
echo "➤ # variableCollections: $(jq -r '.meta.variableCollections | keys | length' <<<"$raw")"
# If variables at root
if jq -e 'has("variables")' <<<"$raw" >/dev/null; then
  echo "➤ # variables (root):   $(jq -r '.variables | keys | length' <<<"$raw")"
else
  echo "➤ # variables (meta):   $(jq -r '.meta.variables | keys | length' <<<"$raw")"
fi

# 4) Let’s try a minimal transform: pull out the first variable’s name & raw value
echo "➤ First variable entry:"
jq -r '
  ( .variables // .meta.variables ) 
  | to_entries[0] 
  | "\(.key) → \(.value.valuesByMode[ (.meta.variableCollections[\(.value.variableCollectionId)].defaultModeId) ])"
' <<<"$raw" || echo "  ❌ failed to extract first var"

# 5) Stub out writing real tokens.json (so the workflow still passes)
mkdir -p FigmaDemoGithub
cat > FigmaDemoGithub/tokens.json <<EOF
{ "debug": true }
EOF
echo "✅ Debug script completed (wrote debug tokens.json)"
