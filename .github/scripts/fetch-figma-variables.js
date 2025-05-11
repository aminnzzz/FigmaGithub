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

  const { variableMap, primitives } = buildVariableMap(variables, variableCollections);
  const tokens = transformToStyleDictionary(variableMap, primitives);

  const outputPath = path.resolve(__dirname, '../../FigmaDemoGithub/tokens.json');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(tokens, null, 2));

  // Dynamic count of all tokens across categories
  const totalCount = Object.values(tokens)
    .reduce((sum, bucket) => sum + Object.keys(bucket).length, 0);

  console.log(`✅ Wrote ${totalCount} tokens to ${outputPath}`);
  return tokens;
}

function buildVariableMap(variables, variableCollections) {
  const entries = Object.entries(variables);
  const variableMap = {};
  const primitives = {};

  for (const [id, variable] of entries) {
    const { variableCollectionId, valuesByMode, name, resolvedType } = variable;
    const collection = variableCollections[variableCollectionId];
    if (!collection) {
      console.warn(`⚠️ Missing collection "${variableCollectionId}" for variable "${id}".`);
      continue;
    }

    const { defaultModeId: modeId } = collection;
    let rawValue = valuesByMode?.[modeId];

    // Fallback to first available mode value
    if (rawValue === undefined) {
      const fallback = Object.values(valuesByMode || {});
      if (fallback.length > 0) {
        rawValue = fallback[0];
        console.warn(
          `⚠️ Default mode "${modeId}" missing for "${id}"; using first available mode value.`
        );
      } else {
        console.warn(`⚠️ No mode values for "${id}"; skipping.`);
        continue;
      }
    }

    const entry = {
      name: typeof name === 'string' ? name.trim() : name,
      resolvedType,
      value: rawValue
    };

    if (collection.name === 'Primitives') {
      primitives[id] = entry;
    } else {
      variableMap[id] = entry;
    }
  }

  return { variableMap, primitives };
}

function transformToStyleDictionary(variableMap, primitives) {
  const allVariables = { ...primitives, ...variableMap };
  const tokens = {};

  for (const [id, { name, resolvedType }] of Object.entries(variableMap)) {
    const parts = name.split('/');
    if (parts.length < 2) {
      console.warn(`⚠️ Unexpected variable name format: "${name}"`);
      continue;
    }

    const [rawCategory, ...rest] = parts;

    // Skip any category starting with uppercase (not a design system token)
    if (/^[A-Z]/.test(rawCategory)) {
      continue;
    }

    const category = rawCategory.toLowerCase();
    const key = rest.join('/');

    if (!tokens[category]) {
      tokens[category] = {};
    }

    const rawValue = resolveVariableValue(id, allVariables);
    if (rawValue == null) {
      continue;
    }

    let formatted;
    switch (resolvedType) {
      case 'COLOR':
        if (rawValue.r != null) {
          formatted = rgbaToHex(rawValue);
        } else {
          console.warn(`⚠️ Unable to resolve COLOR for "${name}"`);
          continue;
        }
        break;
      case 'FLOAT':
      case 'NUMBER':
        const num = parseFloat(rawValue);
        if (Number.isNaN(num)) {
          console.warn(`⚠️ Invalid number for "${name}":`, rawValue);
          continue;
        }
        formatted = num.toString();
        break;
      case 'STRING':
        formatted = rawValue;
        break;
      default:
        console.warn(`⚠️ Unhandled type "${resolvedType}" for "${name}"`);
        continue;
    }

    tokens[category][key] = { value: formatted };
  }

  return tokens;
}

function isAlias(v) {
  return (
    v !== null &&
    typeof v === 'object' &&
    v.type === 'VARIABLE_ALIAS' &&
    typeof v.id === 'string'
  );
}

function resolveVariableValue(startId, lookupMap, visited = new Set(), maxDepth = 50) {
  if (visited.has(startId)) {
    console.warn(`⚠️ Circular alias at "${startId}".`);
    return null;
  }
  if (visited.size >= maxDepth) {
    console.warn(`⚠️ Alias chain too long starting at "${startId}".`);
    return null;
  }

  visited.add(startId);
  const variable = lookupMap[startId];
  if (!variable) {
    console.warn(`⚠️ Variable not found: "${startId}".`);
    return null;
  }

  const { value } = variable;
  if (isAlias(value)) {
    return resolveVariableValue(value.id, lookupMap, visited, maxDepth);
  }

  return value != null ? value : null;
}

function clamp01(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function channelToHex(channel) {
  const byte = Math.round(clamp01(channel) * 255);
  return byte.toString(16).padStart(2, '0').toUpperCase();
}

function rgbaToHex({ r, g, b, a = 1 }) {
  for (const [key, val] of Object.entries({ r, g, b, a })) {
    if (typeof val !== 'number' || Number.isNaN(val)) {
      throw new TypeError(`Invalid ${key} channel: got ${val}`);
    }
  }

  const hexRGB = [r, g, b].map(channelToHex).join('');
  const alpha = clamp01(a);
  return alpha < 1
    ? `#${hexRGB}${channelToHex(alpha)}`
    : `#${hexRGB}`;
}

// Top-level runner with proper error handling
(async () => {
  try {
    await fetchFigmaVariables();
  } catch (err) {
    console.error('❌ Error fetching Figma variables:', err);
    process.exit(1);
  }
})();
