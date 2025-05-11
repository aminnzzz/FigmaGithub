#!/usr/bin/env node
/**
 * generate-tokens-swift.js
 *
 * Reads a nested tokens JSON and emits a Swift file with nested enums.
 *
 * Usage:
 *   node generate-tokens-swift.js [inputJsonPath] [outputSwiftPath]
 */

const fs = require('fs').promises;
const path = require('path');

const [,, inputArg, outputArg] = process.argv;
const OUTPUT_SWIFT = outputArg || path.join(__dirname, '..', 'Sources', 'Generated', 'Tokens.swift');

async function readTokens() {
  if (!inputArg || inputArg === '-') {
    // Read JSON piped in over stdin
    const chunks = [];
    for await (let chunk of process.stdin) chunks.push(chunk);
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } else {
    // Read from a file
    const raw = await fs.readFile(inputArg, 'utf8');
    return JSON.parse(raw);
  }
}

// --- Helpers ---

/** Repeat four spaces * level */
const indent = level => '    '.repeat(level);

/**
 * Convert a segment (e.g. "background-primary") into PascalCase ("BackgroundPrimary").
 * Splits on any non-alphanumeric.
 */
function toPascalCase(raw) {
  return raw
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(seg => seg[0].toUpperCase() + seg.slice(1))
    .join('');
}

/**
 * Convert a segment into lowerCamelCase ("backgroundPrimary").
 */
function toCamelCase(raw) {
  const pascal = toPascalCase(raw);
  return pascal[0].toLowerCase() + pascal.slice(1);
}

/** 
 * Detect whether this node is a leaf (has a single `value` property).
 */
function isLeafNode(obj) {
  return obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, 'value');
}

/**
 * Determine if a node (and all its descendants) are numeric leaves.
 * @param {object} node
 * @returns {boolean}
 */
function isNumericEnum(node) {
  // If this is a leaf, check its value
  if (isLeafNode(node)) {
    // Allow integer or floating‐point syntax
    return /^-?\d+(\.\d+)?$/.test(String(node.value));
  }
  // Otherwise, recurse into children
  return Object.values(node).every(child => isNumericEnum(child));
}

/**
 * Recursively emit a Swift enum from a JS object, choosing Double vs String.
 *
 * @param {string} enumName    PascalCase enum name.
 * @param {object} node        Either a leaf `{ value }` or nested map.
 * @param {number} level       Indent level.
 * @param {string[]} lines     Accumulated Swift source lines.
 */
function emitEnum(enumName, node, level, lines) {
  // 1) Decide raw‐type at this enum level
  const useDouble = isNumericEnum(node);
  const rawType   = useDouble ? 'Double' : 'String';

  lines.push(`${indent(level)}public enum ${enumName}: ${rawType} {`);

  // 2) Nested enums first
  for (const key of Object.keys(node).sort()) {
    const child = node[key];
    if (!isLeafNode(child)) {
      emitEnum(toPascalCase(key), child, level + 1, lines);
    }
  }

  // 3) Leaf cases
  for (const key of Object.keys(node).sort()) {
    const child = node[key];
    if (isLeafNode(child)) {
      const caseName = toCamelCase(key);
      const rawValue = String(child.value);
      const literal  = useDouble
        // leave unquoted for Double
        ? rawValue
        // quote for String
        : `"${rawValue}"`;

      lines.push(
        `${indent(level + 1)}case ${caseName} = ${literal}`
      );
    }
  }

  lines.push(`${indent(level)}}`);
}

// --- Main process ---
(async function main() {
  try {
    // 1. Read & parse
    const tokens = await readTokens();

    // 2. Build Swift lines
    const lines = [];
    lines.push('// Tokens.swift — GENERATED FILE; DO NOT EDIT');
    lines.push('// Run `node generate-tokens-swift.js` to regenerate');
    lines.push('');
    lines.push('import Foundation');
    lines.push('');
    lines.push('public enum Tokens {');

    // 3. Top-level categories
    for (const category of Object.keys(tokens).sort()) {
      const enumName = toPascalCase(category);
      emitEnum(enumName, tokens[category], 1, lines);
    }

    lines.push('}');
    lines.push('');

    // 4. Write out
    await fs.mkdir(path.dirname(OUTPUT_SWIFT), { recursive: true });
    await fs.writeFile(OUTPUT_SWIFT, lines.join('\n'), 'utf8');
    console.log(`✅ Generated Swift tokens at ${OUTPUT_SWIFT}`);
  } catch (err) {
    console.error('❌ Error generating Swift tokens:', err);
    process.exit(1);
  }
})();
