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

// --- CLI arguments & defaults ---
const [,, inputArg, outputArg] = process.argv;
const INPUT_JSON  = inputArg  || path.join(__dirname, 'tokens.json');
const OUTPUT_SWIFT = outputArg || path.join(
  __dirname, '..', '..', 'Sources', 'Generated', 'Tokens.swift'
);

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
 * Recursively emit a Swift enum (with raw type String) from a JS object.
 *
 * @param {string} enumName    PascalCase enum name.
 * @param {object} node        Either a leaf `{ value }` or nested map of more keys.
 * @param {number} level       Indent level.
 * @param {string[]} lines     Accumulated Swift source lines.
 */
function emitEnum(enumName, node, level, lines) {
  lines.push(`${indent(level)}public enum ${enumName}: String {`);

  // First, nested enums
  for (const key of Object.keys(node).sort()) {
    const child = node[key];
    if (!isLeafNode(child)) {
      emitEnum(toPascalCase(key), child, level + 1, lines);
    }
  }

  // Then, leaf cases
  for (const key of Object.keys(node).sort()) {
    const child = node[key];
    if (isLeafNode(child)) {
      const caseName = toCamelCase(key);
      const value    = child.value;
      lines.push(`${indent(level + 1)}case ${caseName} = "${value}"`);
    }
  }

  lines.push(`${indent(level)}}`);
}

// --- Main process ---
(async function main() {
  try {
    // 1. Read & parse
    const raw = await fs.readFile(INPUT_JSON, 'utf8');
    const tokens = JSON.parse(raw);

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
