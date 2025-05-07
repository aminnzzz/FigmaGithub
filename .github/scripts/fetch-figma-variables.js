const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const { promises: fs } = require('fs');
const path = require('path');

const {
  FIGMA_ACCESS_TOKEN,
  FIGMA_FILE_KEY,
  FIGMA_API_BASE = 'https://api.figma.com/v1'
} = process.env;

if (!FIGMA_ACCESS_TOKEN || !FIGMA_FILE_KEY) {
  console.error('⛔ Missing FIGMA_ACCESS_TOKEN or FIGMA_FILE_KEY');
  process.exit(1);
}

const client = axios.create({
  baseURL: FIGMA_API_BASE,
  timeout: 5000,
  headers: { 'X-Figma-Token': FIGMA_ACCESS_TOKEN }
});

axiosRetry(client, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: err =>
    axiosRetry.isNetworkOrIdempotentRequestError(err) ||
    err.response?.status === 429,
  onRetry: (err, attempt) =>
    console.log(`Retry #${attempt} ${err.config.method.toUpperCase()} ${err.config.url}: ${err.message}`)
});

async function fetchFigmaVariables() {
  const endpoint = `/files/${FIGMA_FILE_KEY}/variables/local`;
  const { data } = await client.get(endpoint);
  const { status, error, meta } = data;

  if (status !== 200 || error) {
    throw new Error(`Figma API error (status=${status}, error=${error})`);
  }

  const { variables, variableCollections } = meta || {};

  if (!variables || !variableCollections) {
    throw new Error('Unexpected Figma response: missing meta.variables or meta.variableCollections');
  }

  const variableMap = buildVariableMap(variables, variableCollections);
  const tokens = transformToStyleDictionary(variableMap);

  const outputPath = path.resolve(__dirname, '../../FigmaDemoGithub/tokens.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  await fs.writeFile(outputPath, JSON.stringify(tokens, null, 2));
  console.log(`✅ Wrote ${Object.keys(tokens.color).length + Object.keys(tokens.spacing).length} tokens to ${outputPath}`);

  return tokens;
}

function buildVariableMap(variables, variableCollections) {
  const entries = Object.entries(variables);
  const total = entries.length;
  const variableMap = {};

  for (const [id, variable] of entries) {
    const {
      variableCollectionId,
      valuesByMode,
      name,
      resolvedType
    } = variable;

    const collection = variableCollections[variableCollectionId];
    if (!collection) {
      console.warn(
        `⚠️ Missing collection "${variableCollectionId}" for variable "${id}".`
      );
      continue;
    }

    const { defaultModeId: modeId } = collection;
    const rawValue = valuesByMode?.[modeId];
    if (rawValue === undefined) {
      console.warn(
        `⚠️ Mode "${modeId}" not present for variable "${id}".`
      );
      continue;
    }

    variableMap[id] = {
      name: typeof name === 'string' ? name.trim() : name,
      resolvedType,
      value: rawValue
    };
  }

  return variableMap;
}

function transformToStyleDictionary(variableMap) {
  const tokens = {
    color: {},
    padding: {},
    spacing: {},
    radius: {},
    borderWidth: {},
    typography: {}
  };

  const paddingRegex       = /^padding\//i;
  const spacingRegex       = /^spacing\//i;
  const radiusRegex        = /^(?:radius|border-?radius)\//i;
  const borderWidthRegex   = /^(?:stroke|border-?width)\//i;
  const fontSizeRegex      = /^(?:font-?size|type-?size)\//i;
  const lineHeightRegex    = /^line-?height\//i;
  const fontFamilyRegex    = /^font\/family\//i;
  const fontWeightRegex    = /^font\/weight\//i;

  for (const [id, { name, resolvedType }] of Object.entries(variableMap)) {
    const value = resolveVariableValue(id, variableMap);

    if (resolvedType === 'COLOR') {
      if (value && value.r != null) {
        tokens.color[name] = {
          value: rgbaToHex(value),
          type: 'color'
        };
      } else {
        console.warn(`⚠️ Unable to resolve COLOR for token "${name}"`);
      }
    }
    else if (resolvedType === 'FLOAT' || resolvedType === 'NUMBER') {
      const num = parseFloat(value);
      if (isNaN(num)) {
        console.warn(`⚠️ Invalid number for "${name}":`, value);
        continue;
      }

      if (spacingRegex.test(name)) {
        tokens.spacing[name] = { value: num.toString(), type: 'spacing' };
      }
      else if (paddingRegex.test(name)) {
        tokens.padding[name] = { value: num.toString(), type: 'padding' };
      }
      else if (radiusRegex.test(name)) {
        tokens.radius[name] = { value: num.toString(), type: 'borderRadius' };
      }
      else if (borderWidthRegex.test(name)) {
        tokens.borderWidth[name] = { value: num.toString(), type: 'borderWidth' };
      }
      else if (fontSizeRegex.test(name)) {
        tokens.typography[name] = { value: `${num}px`, type: 'fontSize' };
      }
      else if (lineHeightRegex.test(name)) {
        tokens.typography[name] = { value: `${num}px`, type: 'lineHeight' };
      }
      else {
        // Fallback: other numeric tokens go under typography
        tokens.typography[name] = { value: num.toString(), type: 'number' };
      }
    }
    else if (resolvedType === 'STRING') {
      // handle font family & font weight tokens
      if (fontFamilyRegex.test(name)) {
        tokens.typography[name] = { value, type: 'fontFamily' };
      }
      else if (fontWeightRegex.test(name)) {
        tokens.typography[name] = { value, type: 'fontWeight' };
      }
      else {
        // any other string tokens
        tokens.typography[name] = { value, type: 'string' };
      }
    }
    else {
      // You can extend here for BOOLEAN, etc.
      console.warn(`⚠️ Unhandled type "${resolvedType}" for token "${name}"`);
    }
  }

  return tokens;
}


function resolveVariableValue(startId, variableMap) {
  const visited = new Set();
  let currentId = startId;

  while (true) {
    if (visited.has(currentId)) {
      console.warn(`⚠️ Circular alias detected at "${currentId}".`);
      return null;
    }

    visited.add(currentId);

    const variable = variableMap[currentId];
    if (!variable) {
      console.warn(`⚠️ Variable not found: "${currentId}".`);
      return null;
    }

    const { value } = variable;
    // If it’s an alias, follow its `id` to the next variable
    if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
      if (!value.id) {
        console.warn(`⚠️ Alias for "${currentId}" is missing 'id'.`);
        return null;
      }
      currentId = value.id;
      continue;
    }

    return value != null ? value : null;
  }
}

function rgbaToHex({ r, g, b, a = 1 }) {
  // Ensure channels are numbers
  [r, g, b, a].forEach((v, i) => {
    if (typeof v !== 'number' || Number.isNaN(v)) {
      throw new TypeError(`Channel ${['r','g','b','a'][i]} must be a number, got ${v}`);
    }
  });

  // Clamp into [0,1]
  const clamp = v => Math.min(1, Math.max(0, v));

  // Convert a single channel to two-digit uppercase hex
  const toHex = v =>
    Math.round(clamp(v) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  const rgbHex = `${toHex(r)}${toHex(g)}${toHex(b)}`;
  // Only append alpha if it’s not fully opaque
  return a < 1
    ? `#${rgbHex}${toHex(a)}`
    : `#${rgbHex}`;
}

fetchFigmaVariables();
