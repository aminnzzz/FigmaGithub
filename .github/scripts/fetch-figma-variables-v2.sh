#!/usr/bin/env bash
set -euo pipefail

: "${FIGMA_ACCESS_TOKEN:?Need FIGMA_ACCESS_TOKEN}"
: "${FIGMA_FILE_KEY:?Need FIGMA_FILE_KEY}"
API_BASE="${FIGMA_API_BASE:-https://api.figma.com/v1}"
OUT_JSON="FigmaDemoGithub/tokens.json"

# 1) Fetch raw JSON
raw=$(curl -sSL \
  -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "$API_BASE/files/$FIGMA_FILE_KEY/variables/local")

# 2) Sanity‐check first entry
echo "➤ First variable entry details:"
echo "$raw" | jq -r '
  .meta as $m
  | $m.variables
  | to_entries[0] as $e
  | ($e.value.variableCollectionId) as $cid
  | ($m.variableCollections[$cid].defaultModeId) as $mode
  | ($e.key) as $id
  | ($e.value.name) as $name
  | ($e.value.valuesByMode[$mode]) as $raw
  | "ID: \($id) -> Name: \($name) -> Raw: \($raw)"
'

# 3) Build just the color bucket correctly
colors_json=$(echo "$raw" | jq -r '
  .meta as $m
  | ($m.variables | to_entries)         # <-- FIXED: keep as an array
  | map(
      (.value.name)                                as $name |
      (.value.variableCollectionId)                as $cid  |
      ($m.variableCollections[$cid].defaultModeId) as $mode |
      (.value.valuesByMode[$mode])                 as $c     |

      # RGBA → hex
      ($c.r * 255 | floor)                         as $r     |
      ($c.g * 255 | floor)                         as $g     |
      ($c.b * 255 | floor)                         as $b     |
      (
        ("0123456789ABCDEF"[($r/16|floor):1] + "0123456789ABCDEF"[($r%16):1]) +
        ("0123456789ABCDEF"[($g/16|floor):1] + "0123456789ABCDEF"[($g%16):1]) +
        ("0123456789ABCDEF"[($b/16|floor):1] + "0123456789ABCDEF"[($b%16):1])
      )                                            as $hex |
      { ($name): { value: "#\($hex)", type: "color" } }
    )
  | add
')

# 4) Emit tokens.json (colors real, others stubbed)
mkdir -p "$(dirname "$OUT_JSON")"
cat > "$OUT_JSON" <<EOF
{
  "color": $colors_json,
  "spacing": {},
  "padding": {},
  "radius": {},
  "borderWidth": {},
  "typography": {}
}
EOF

# 5) Report
count=$(echo "$colors_json" | jq 'keys | length')
echo "✅ Wrote $count color tokens to $OUT_JSON (other categories still stubbed)"
