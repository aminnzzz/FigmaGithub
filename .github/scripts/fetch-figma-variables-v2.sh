#!/usr/bin/env bash
set -euo pipefail

: "${FIGMA_ACCESS_TOKEN:?Need FIGMA_ACCESS_TOKEN}"
: "${FIGMA_FILE_KEY:?Need FIGMA_FILE_KEY}"
API_BASE="${FIGMA_API_BASE:-https://api.figma.com/v1}"
OUT_JSON="FigmaDemoGithub/tokens.json"

# 1) Fetch
raw=$(curl -sSL \
  -H "X-Figma-Token: $FIGMA_ACCESS_TOKEN" \
  "$API_BASE/files/$FIGMA_FILE_KEY/variables/local")

# 2) Basic error check
status=$(jq -r '.status' <<<"$raw")
error=$(jq -r '.error'  <<<"$raw")
if [[ "$status" -ne 200 || "$error" == "true" ]]; then
  echo "⛔ Figma API error: status=$status, error=$error"
  exit 1
fi

# 3) Normalize and transform via jq
echo "$raw" | jq '
  # Grab the variables map (top-level or under meta)
  . as $root
  | ($root.variables // $root.meta.variables) as $vars
  | ($root.meta.variableCollections)       as $collections

  # Recursively resolve VARIABLE_ALIAS
  | def resolve($id):
      ($vars[$id] // {})             as $var
      | $collections[$var.variableCollectionId].defaultModeId as $mode
      | $var.valuesByMode[$mode]      as $v
      | if ($v|type)=="object" and $v.type=="VARIABLE_ALIAS" 
        then resolve($v.id) 
        else $v 
        end;

  # 0–255 integer to two‐char hex
  | def hex2(i):
      (i|floor) as $x
      | ($x/16|floor) as $h1
      | ($x%16)        as $h2
      | "0123456789ABCDEF"[$h1:1] + "0123456789ABCDEF"[$h2:1];

  # Start with empty buckets
  | {color: {}, spacing: {}, padding: {}, radius: {}, borderWidth: {}, typography: {}}
  | reduce ($vars | to_entries[]) as $e (
      .;
      ($e.value.resolvedType) as $t
      | ($e.value.name)       as $name
      | resolve($e.key)       as $v

      # COLOR → hex
      | if $t == "COLOR" then
          ($v.r*255|floor) as $r
          | ($v.g*255|floor) as $g
          | ($v.b*255|floor) as $b
          | (hex2($r)+hex2($g)+hex2($b)) as $hex
          | .color[$name]     = {value:"#\($hex)", type:"color"}

      # FLOAT/NUMBER → other categories
      elif $t == "FLOAT" or $t == "NUMBER" then
          ($v|tostring)     as $s
          | if     $name|test("^spacing/";"i")          then .spacing[$name]     = {value:$s,      type:"spacing"}
            elif  $name|test("^padding/";"i")          then .padding[$name]     = {value:$s,      type:"padding"}
            elif  $name|test("^(radius|border-?radius)/";"i") then .radius[$name]      = {value:$s,      type:"borderRadius"}
            elif  $name|test("^(stroke|border-?width)/";"i")  then .borderWidth[$name]= {value:$s,      type:"borderWidth"}
            elif  $name|test("^(font-?size|type-?size)/";"i") then .typography[$name]  = {value:($s+"px"), type:"fontSize"}
            elif  $name|test("^line-?height/";"i")        then .typography[$name]  = {value:($s+"px"), type:"lineHeight"}
            else                                          .typography[$name]  = {value:$s,      type:"number"}
          end

      else .
      end
    )
' > "$OUT_JSON"

# 4) Count and report
count=$(jq '(.color|keys|length)
           +(.spacing|keys|length)
           +(.padding|keys|length)
           +(.radius|keys|length)
           +(.borderWidth|keys|length)
           +(.typography|keys|length)' "$OUT_JSON")

echo "✅ Wrote $count tokens to $OUT_JSON"
