#!/usr/bin/env bash
set -euo pipefail

# Usage: fetch-figma-variables.sh <FIGMA_TOKEN> <FILE_KEY>
FIGMA_TOKEN="$1"
FILE_KEY="$2"
API_BASE="${FIGMA_API_BASE:-https://api.figma.com/v1}"
OUTPUT_PATH="$(pwd)/FigmaDemoGithub/tokens.json"

# Fetch variables from Figma
response=$(curl -sS -H "X-Figma-Token: ${FIGMA_TOKEN}" \
  "${API_BASE}/files/${FILE_KEY}/variables/local")
status=$(echo "$response" | jq -r '.status')
error=$(echo "$response" | jq -r '.error // empty')
if [[ "$status" != "200" || -n "$error" ]]; then
  echo "⛔ Figma API error (status=$status, error=$error)" >&2
  exit 1
fi

vars=$(echo "$response" | jq '.meta.variables')\cols=$(echo "$response" | jq '.meta.variableCollections')

# Build variable map
declare -A nameMap typeMap rawMap
for id in $(echo "$vars" | jq -r 'keys[]'); do
  var=$(echo "$vars" | jq -r --arg id "$id" '.[$id]')
  colId=$(echo "$var" | jq -r '.variableCollectionId')
  coll=$(echo "$cols" | jq -r --arg colId "$colId" '.[$colId]')
  [[ "$coll" == "null" ]] && { echo "⚠️ Missing collection $colId for $id" >&2; continue; }
  modeId=$(echo "$coll" | jq -r '.defaultModeId')
  value=$(echo "$var" | jq -c --arg modeId "$modeId" '.valuesByMode[$modeId] // empty')
  [[ -z "$value" ]] && { echo "⚠️ Mode $modeId missing for $id" >&2; continue; }
  nameMap["$id"]=$(echo "$var" | jq -r '.name | @sh' | sed "s/^'//;s/'$//")
  typeMap["$id"]=$(echo "$var" | jq -r '.resolvedType')
  rawMap["$id"]="$value"
done

# Resolve aliases
resolve() {
  local id="$1" visited=()
  while true; do
    for v in "${visited[@]}"; do [[ "$v" == "$id" ]] && { echo null; return; }; done
    visited+=("$id")
    val="${rawMap[$id]}"
    typ="${typeMap[$id]}"
    if [[ "$typ" == "VARIABLE_ALIAS" ]]; then
      id=$(echo "$val" | jq -r '.id')
      continue
    fi
    echo "$val"; return
  done
}

# Initialize output token structure
mkdir -p "$(dirname "$OUTPUT_PATH")"
echo '{"color":{},"padding":{},"spacing":{},"radius":{},"borderWidth":{},"typography":{}}' > tmp-tokens.json

# Populate tokens
for id in "${!nameMap[@]}"; do
  name="${nameMap[$id]}"
  typ="${typeMap[$id]}"
  value=$(resolve "$id")
  if [[ "$typ" == "COLOR" ]]; then
    hex=$(echo "$value" | jq -r '. as {r,g,b,a?} |
      def clamp(v): if v<0 then 0 elif v>1 then 1 else v end;
      def toHex(v): ((clamp(v)*255)|round|tohex)|ascii_upcase;
      if .a<1 then "#" + toHex(.r)+toHex(.g)+toHex(.b)+toHex(.a) else "#" + toHex(.r)+toHex(.g)+toHex(.b) end')
    jq ".color[\"$name\"]={value:\"$hex\",type:\"color\"}" tmp-tokens.json > tmp2.json && mv tmp2.json tmp-tokens.json
  elif [[ "$typ" =~ ^(FLOAT|NUMBER)$ ]]; then
    num=$(echo "$value" | jq -r)
    # Classify token by name pattern
    if [[ $name =~ ^spacing/ ]];       then sec="spacing"; catType="spacing";
    elif [[ $name =~ ^padding/ ]];     then sec="padding"; catType="padding";
    elif [[ $name =~ ^(radius|border-?radius)/ ]]; then sec="radius"; catType="borderRadius";
    elif [[ $name =~ ^(stroke|border-?width)/ ]];  then sec="borderWidth"; catType="borderWidth";
    elif [[ $name =~ ^(font-?size|type-?size)/ ]]; then sec="typography"; catType="fontSize"; num="${num}px";
    elif [[ $name =~ ^line-?height/ ]]; then sec="typography"; catType="lineHeight"; num="${num}px";
    else sec="typography"; catType="number";
    fi
    jq ".${sec}[\"$name\"]={value:\"$num\",type:\"$catType\"}" tmp-tokens.json > tmp2.json && mv tmp2.json tmp-tokens.json
  fi
done

mv tmp-tokens.json "$OUTPUT_PATH"
echo "✅ Wrote tokens to $OUTPUT_PATH"