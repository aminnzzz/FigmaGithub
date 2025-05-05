#!/usr/bin/env bash
set -euo pipefail

# Usage: fetch-figma-variables-v2.sh <FIGMA_TOKEN> <FILE_KEY>
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

# Extract variables and collections
vars=$(echo "$response" | jq '.meta.variables')
cols=$(echo "$response" | jq '.meta.variableCollections')

# Build variable map
declare -A nameMap typeMap rawMap
for id in $(echo "$vars" | jq -r 'keys[]'); do
  entry=$(echo "$vars" | jq -c --arg id "$id" '.[$id]')
  colId=$(echo "$entry" | jq -r '.variableCollectionId')
  coll=$(echo "$cols" | jq -c --arg colId "$colId" '.[$colId]')
  if [[ "$coll" == "null" ]]; then
    echo "⚠️ Missing collection $colId for $id" >&2
    continue
  fi
  modeId=$(echo "$coll" | jq -r '.defaultModeId')
  rawVal=$(echo "$entry" | jq -c --arg modeId "$modeId" '.valuesByMode[$modeId] // empty')
  if [[ -z "$rawVal" ]]; then
    echo "⚠️ Mode $modeId missing for $id" >&2
    continue
  fi
  nameMap["$id"]=$(echo "$entry" | jq -r '.name')
  typeMap["$id"]=$(echo "$entry" | jq -r '.resolvedType')
  rawMap["$id"]="$rawVal"
done

# Resolve aliases and return final JSON value
resolve() {
  local curr="$1"
  local visited=()
  local val
  while true; do
    for v in "${visited[@]}"; do
      [[ "$v" == "$curr" ]] && { echo 'null'; return; }
    done
    visited+=("$curr")
    val="${rawMap[$curr]}"
    # Follow VARIABLE_ALIAS values
    if echo "$val" | jq -e 'has("type") and .type=="VARIABLE_ALIAS"' >/dev/null 2>&1; then
      curr=$(echo "$val" | jq -r '.id')
      continue
    fi
    echo "$val"
    return
  done
}

# Initialize Style Dictionary structure
mkdir -p "$(dirname "$OUTPUT_PATH")"
echo '{"color":{},"padding":{},"spacing":{},"radius":{},"borderWidth":{},"typography":{}}' > tmp-tokens.json

# Populate tokens
for id in "${!nameMap[@]}"; do
  name=${nameMap[$id]}
  typ=${typeMap[$id]}
  value=$(resolve "$id")

  if [[ "$typ" == "COLOR" ]]; then
    # Extract and clamp RGBA channels, scale to 0–255
    read r g b aVal < <(
      echo "$value" | jq -r '
        [ .r, .g, .b, (.a // 1) ]
        | map(
            (if . < 0 then 0 elif . > 1 then 1 else . end) * 255
            | round
          )
        | .[]
      '
    )
    # Format channels as two-digit uppercase hexadecimal
    printf -v rhx '%02X' "$r"
    printf -v ghx '%02X' "$g"
    printf -v bhx '%02X' "$b"
    if (( aVal < 255 )); then
      printf -v ahx '%02X' "$aVal"
      hex="#${rhx}${ghx}${bhx}${ahx}"
    else
      hex="#${rhx}${ghx}${bhx}"
    fi
    jq --arg name "$name" --arg hex "$hex" \
       '.color[$name]={value:$hex,type:"color"}' tmp-tokens.json > tmp2.json && mv tmp2.json tmp-tokens.json

  elif [[ "$typ" =~ ^(FLOAT|NUMBER)$ ]]; then
    num=$(echo "$value" | jq -r)
    # Classify numeric token by name
    if [[ $name =~ ^spacing/ ]]; then sec="spacing"; catType="spacing";
    elif [[ $name =~ ^padding/ ]]; then sec="padding"; catType="padding";
    elif [[ $name =~ ^(radius|border-?radius)/ ]]; then sec="radius"; catType="borderRadius";
    elif [[ $name =~ ^(stroke|border-?width)/ ]]; then sec="borderWidth"; catType="borderWidth";
    elif [[ $name =~ ^(font-?size|type-?size)/ ]]; then sec="typography"; catType="fontSize"; num="${num}px";
    elif [[ $name =~ ^line-?height/ ]]; then sec="typography"; catType="lineHeight"; num="${num}px";
    else sec="typography"; catType="number";
    fi
    jq --arg name "$name" --arg num "$num" --arg catType "$catType" --arg sec "$sec" \
       '.[$sec][$name]={value:$num,type:$catType}' tmp-tokens.json > tmp2.json && mv tmp2.json tmp-tokens.json
  fi
done

# Finalize tokens.json
mv tmp-tokens.json "$OUTPUT_PATH"
echo "✅ Wrote tokens to $OUTPUT_PATH"