#!/usr/bin/env bash
set -euo pipefail

: "${FIGMA_ACCESS_TOKEN:?Need FIGMA_ACCESS_TOKEN}"
: "${FIGMA_FILE_KEY:?Need FIGMA_FILE_KEY}"
API_BASE="${FIGMA_API_BASE:-https://api.figma.com/v1}"
OUT_JSON="FigmaDemoGithub/tokens.json"

# 1. Fetch raw Figma JSON
raw=$(curl -sSL \
  -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "$API_BASE/files/$FIGMA_FILE_KEY/variables/local")

# 2. Basic error check
status=$(jq -r '.status' <<<"$raw")
error=$(jq -r '.error'  <<<"$raw")
if [[ "$status" -ne 200 || "$error" == "true" ]]; then
  echo "⛔ Figma API error: status=$status, error=$error"
  exit 1
fi

# 3. Transform with jq (read JSON from stdin)
echo "$raw" | jq '
  # Resolve VARIABLE_ALIAS chains
  def resolve($id):
    (.meta.variables[$id] // {}) as $var
    | (.meta.variableCollections[$var.variableCollectionId].defaultModeId) as $mode
    | ($var.valuesByMode[$mode]) as $v
    | if ($v|type)=="object" and ($v.type=="VARIABLE_ALIAS") then
        resolve($v.id)
      else
        $v
      end;

  # Convert 0–255 integer to two‐char uppercase hex
  def hex2(i):
    (i|floor) as $x
    | ($x/16|floor) as $h1
    | ($x%16)    as $h2
    | "0123456789ABCDEF"[$h1:1] + "0123456789ABCDEF"[$h2:1];

  # Build token buckets
  {
    color: {}, spacing: {}, padding: {}, radius: {}, borderWidth: {}, typography: {}
  }
  | reduce (.meta.variables | to_entries[]) as $e (
      .;
      ($e.value.resolvedType) as $t
      | ($e.value.name) as $name
      | (resolve($e.key)) as $val

      # COLOR → hex
      | if $t == "COLOR" then
          ($val.r * 255 | floor) as $r
          | ($val.g * 255 | floor) as $g
          | ($val.b * 255 | floor) as $b
          | (hex2($r) + hex2($g) + hex2($b)) as $hex
          | .color[$name] = { value: ("#\($hex)"), type: "color" }

      # FLOAT/NUMBER → numeric tokens
      elif ($t == "FLOAT" or $t == "NUMBER") then
          ($val | tostring) as $s
          | if     $name | test("^spacing/";"i")          then .spacing[$name]     = {value:$s,      type:"spacing"}
            elif  $name | test("^padding/";"i")          then .padding[$name]     = {value:$s,      type:"padding"}
            elif  $name | test("^(radius|border-?radius)/";"i") then .radius[$name]      = {value:$s,      type:"borderRadius"}
            elif  $name | test("^(stroke|border-?width)/";"i")  then .borderWidth[$name]= {value:$s,      type:"borderWidth"}
            elif  $name | test("^(font-
