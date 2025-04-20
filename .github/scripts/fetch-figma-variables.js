const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FIGMA_ACCESS_TOKEN = process.env.FIGMA_ACCESS_TOKEN;
const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

async function fetchFigmaVariables() {
  try {
    const response = await axios.get(
      `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/variables/local`,
      {
        headers: {
          'X-Figma-Token': FIGMA_ACCESS_TOKEN
        }
      }
    );

    const collections = response.data.meta.variableCollections;
    const variables = response.data.meta.variables;
    
    // Transform variables into StyleDictionary format
    const tokens = transformToStyleDictionary(collections, variables);
    
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

function transformToStyleDictionary(collections, variables) {
  const tokens = {
    color: {},
    spacing: {},
    typography: {},
  };

  Object.values(variables).forEach(variable => {
    const value = variable.valuesByMode[Object.keys(variable.valuesByMode)[0]];
    
    switch(variable.resolvedType) {
      case 'COLOR':
        if (typeof value === 'object' && value.r !== undefined) {
          tokens.color[variable.name] = {
            value: rgbaToHex(value),
            type: 'color'
          };
        } else if (value.type === 'VARIABLE_ALIAS') {
          // Handle variable aliases by referencing the original variable
          tokens.color[variable.name] = {
            value: `{${value.id}}`,
            type: 'color'
          };
        }
        break;
      case 'FLOAT':
      case 'NUMBER':
        const numericValue = parseFloat(value);
        if (variable.name.includes('spacing') || variable.name.includes('padding')) {
          tokens.spacing[variable.name] = {
            value: `${numericValue}`,
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
