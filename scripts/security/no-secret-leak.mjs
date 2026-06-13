import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const scanTargets = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs', 'src', 'tests'];
const textExtensions = new Set([
  '.css',
  '.js',
  '.json',
  '.jsonc',
  '.jsx',
  '.md',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);
const ignoredDirs = new Set(['.git', '.wrangler', 'coverage', 'dist', 'node_modules']);
const allowedPlaceholders = new Set(['YOUR_API_KEY', '{env:MCP_DEV_HUB_API_KEY}', '<API_KEY>']);

const stripValue = (value) =>
  value
    .trim()
    .replace(/^[`'"]+/, '')
    .replace(/[`'",;]+$/, '')
    .trim();

const isVariableReference = (value) =>
  /^\$[A-Za-z_:][A-Za-z0-9_:]*$/.test(value) ||
  /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/.test(value) ||
  /^process\.env\.[A-Za-z_][A-Za-z0-9_]*$/.test(value) ||
  value === 'apiKey';

const isAllowed = (rawValue) => {
  const value = stripValue(rawValue);
  return allowedPlaceholders.has(value) || isVariableReference(value);
};

const walk = (target) => {
  const absolute = path.join(root, target);
  if (!existsSync(absolute)) {
    return [];
  }

  const stats = statSync(absolute);
  if (stats.isFile()) {
    return textExtensions.has(path.extname(absolute)) ? [absolute] : [];
  }

  const files = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirs.has(entry.name)) {
      continue;
    }
    const child = path.join(absolute, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(path.relative(root, child)));
    } else if (textExtensions.has(path.extname(entry.name))) {
      files.push(child);
    }
  }
  return files;
};

const checkLine = (line) => {
  const findings = [];
  const bearerPattern =
    /(?:Authorization\s*[:=]\s*["']?|--header\s+["'][^"']*Authorization:\s*)Bearer\s+([^"'\s,}]+)/gi;
  const apiKeyPattern = /["']?x-api-key["']?\s*[:=]\s*["']?([^"',\s}]+)/gi;
  const envValuePattern = /\bMCP_DEV_HUB_API_KEY\b\s*[:=]\s*["']?([^"',\s}]+)/gi;

  for (const match of line.matchAll(bearerPattern)) {
    if (!isAllowed(match[1])) {
      findings.push('Bearer token literal');
    }
  }

  for (const match of line.matchAll(apiKeyPattern)) {
    if (!isAllowed(match[1])) {
      findings.push('x-api-key literal');
    }
  }

  for (const match of line.matchAll(envValuePattern)) {
    if (!isAllowed(match[1])) {
      findings.push('MCP_DEV_HUB_API_KEY literal');
    }
  }

  return findings;
};

const files = [...new Set(scanTargets.flatMap(walk))].sort();
const violations = [];

for (const file of files) {
  const relative = path.relative(root, file);
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const finding of checkLine(line)) {
      violations.push(`${relative}:${index + 1} ${finding}`);
    }
  });
}

if (violations.length > 0) {
  console.error(
    'Secret leak scan failed. Replace raw values with YOUR_API_KEY, <API_KEY>, or {env:MCP_DEV_HUB_API_KEY}.'
  );
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Secret leak scan passed (${files.length} files checked).`);
