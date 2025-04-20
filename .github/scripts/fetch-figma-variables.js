const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

async function fetchFigmaVariables() {
  try {
    // Fetch variables and their collections
    const variablesResponse = await axios.get(
      `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/variables/local`,
      {
        headers: {
          'X-Figma-Token': FIGMA_ACCESS_TOKEN
        }
      }
    );

    // Create a map of variable IDs to their actual values
    const variableMap = {};
    Object.entries(variablesResponse.data.meta.variables).forEach(([id, variable]) => {
      const modeId = Object.keys(variable.valuesByMode)[0];
      const value = variable.valuesByMode[modeId];
      variableMap[id] = {
        value,
        resolvedType: variable.resolvedType,
        name: variable.name
      };
    });

    // Transform variables into StyleDictionary format with resolved references
    const tokens = transformToStyleDictionary(variableMap);
    
    // Write to a JSON file that Style Dictionary will use
    fs.writeFileSync(
      path.join(__dirname, '../../DesignSystem/tokens.json'),
      JSON.stringify(tokens, null, 2)
    );
    
  } catch (error) {
    console.error('Error fetching Figma variables:', error);
    process.exit(1);
  }
}

function resolveVariableValue(variableId, variableMap, visited = new Set()) {
  if (visited.has(variableId)) {
    console.warn(`Circular reference detected for variable ${variableId}`);
    return null;
  }

  const variable = variableMap[variableId];
  if (!variable) return null;

  visited.add(variableId);

  if (variable.value.type === 'VARIABLE_ALIAS') {
    // Extract the base variable ID (remove any collection prefix)
    const referencedId = variable.value.id.split('/').pop();
    return resolveVariableValue(referencedId, variableMap, visited);
  }

  return variable.value;
}

function transformToStyleDictionary(variableMap) {
  const tokens = {
    color: {},
    spacing: {},
    typography: {}
  };

  Object.entries(variableMap).forEach(([id, variable]) => {
    const resolvedValue = resolveVariableValue(id, variableMap);
    
    switch(variable.resolvedType) {
      case 'COLOR':
        if (resolvedValue && typeof resolvedValue === 'object' && resolvedValue.r !== undefined) {
          tokens.color[variable.name] = {
            value: rgbaToHex(resolvedValue),
            type: 'color'
          };
        }
        break;
      case 'FLOAT':
      case 'NUMBER':
        const numericValue = parseFloat(resolvedValue);
        if (!isNaN(numericValue) && (variable.name.includes('padding') || variable.name.includes('spacing'))) {
          tokens.spacing[variable.name] = {
            value: numericValue.toString(),
            type: 'spacing'
          };
        }
        break;
    }
  });

  return tokens;
}

function rgbaToHex({ r, g, b, a }) {
  const toHex = (value) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}${a < 1 ? toHex(a) : ''}`;
}

fetchFigmaVariables();
