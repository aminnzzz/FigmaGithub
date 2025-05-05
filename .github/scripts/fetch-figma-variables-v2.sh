#!/usr/bin/env bash
set -euo pipefail
OUT_JSON="FigmaDemoGithub/tokens.json"

# Ensure output directory exists
mkdir -p "$(dirname "$OUT_JSON")"

# Emit a minimal, valid tokens.json
cat > "$OUT_JSON" <<EOF
{
  "color": {
    "color/base/white": { "value": "#FFFFFF", "type": "color" }
  },
  "spacing": {},
  "padding": {},
  "radius": {},
  "borderWidth": {},
  "typography": {}
}
EOF

echo "✅ Wrote stub tokens to $OUT_JSON"
