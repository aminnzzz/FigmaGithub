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

# 3. Transform with jq
#    This jq filter does:
#      a) Builds a map of id → {name, type, rawValue}
#      b) Resolves VARIABLE_ALIAS chains
#      c) Groups into color, spacing, padding, radius, borderWidth, typography
#      d) Converts RGBA to hex
#
jq -n --argfile data <(printf '%s' "$raw") '
  ## helper: resolve a VARIABLE_ALIAS chain
  def resolve($id):
    ($data.meta.variables[$id] // {} ) as $var
    | ($data.meta.variableCollections[$var.variableCollectionId].defaultModeId) as $mode
    | ($var.valuesByMode[$mode]) as $v
    | if ($v|type)=="object" and ($v.type=="VARIABLE_ALIAS") then
        resolve($v.id)
      else
        $v
      end;

  ## build tokens
  {
    color:   ({}),
    spacing: ({}),
    padding: ({}),
    radius:  ({}),
    borderWidth: ({}),
    typography:  ({})
  }
  | reduce ($data.meta.variables | to_entries[]) as $e (
      .;
      ($e.value.resolvedType) as $t
      | ($e.value.name) as $name
      | (resolve($e.key)) as $val
      | if $t=="COLOR" then
          ## rgba → hex
          ($val.r*255|floor|tostring|lpad(2;"0") +
           $val.g*255|floor|tostring|lpad(2;"0") +
           $val.b*255|floor|tostring|lpad(2;"0")) as $hex
          | .color[$name] = {value:"#\($hex|ascii_upcase)", type:"color"}
        elif ($t=="FLOAT" or $t=="NUMBER") then
          ($val|tostring) as $s
          | if $name|test("^spacing/";"i")    then .spacing[$name]    = {value:$s, type:"spacing"}
            elif $name|test("^padding/";"i")   then .padding[$name]    = {value:$s, type:"padding"}
            elif $name|test("^(radius|border-?radius)/";"i")
                                                 then .radius[$name]     = {value:$s, type:"borderRadius"}
            elif $name|test("^(stroke|border-?width)/";"i")
                                                 then .borderWidth[$name]= {value:$s, type:"borderWidth"}
            elif $name|test("^(font-?size|type-?size)/";"i")
                                                 then .typography[$name] = {value:"\($s)px", type:"fontSize"}
            elif $name|test("^line-?height/";"i")
                                                 then .typography[$name] = {value:"\($s)px", type:"lineHeight"}
            else                              .typography[$name] = {value:$s, type:"number"}
          end
        else
          .
        end
    )
' > "$OUT_JSON"

echo "✅ Wrote tokens to $OUT_JSON"