import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export async function loadRegistry(repoRoot = process.cwd()) {
  const registryPath = join(repoRoot, 'memory/registry.yml');
  const text = await readFile(registryPath, 'utf8');
  return parseRegistry(text);
}

export function parseRegistry(text) {
  const registry = { version: 1, features: {}, systems: {}, integrations: {} };
  let top = null;
  let entityName = null;
  let group = null;
  let groupKey = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const topMatch = line.match(/^([a-z_]+):(?:\s+(.+))?$/);
    if (topMatch) {
      top = topMatch[1];
      entityName = null;
      group = null;
      groupKey = null;
      if (topMatch[2] && top === 'version') {
        registry.version = Number(topMatch[2]);
      }
      continue;
    }

    const entityMatch = line.match(/^  ([a-z0-9_]+):$/);
    if (entityMatch && top && registry[top]) {
      entityName = entityMatch[1];
      registry[top][entityName] = {};
      group = null;
      groupKey = null;
      continue;
    }

    if (!top || !entityName || !registry[top]) continue;
    const entity = registry[top][entityName];

    const propMatch = line.match(/^    ([a-z_]+):(?:\s+(.+))?$/);
    if (propMatch) {
      const key = propMatch[1];
      const value = propMatch[2];
      group = null;
      groupKey = null;
      if (value === undefined) {
        entity[key] = {};
        group = key;
      } else {
        entity[key] = coerceScalar(value);
      }
      continue;
    }

    if (!group) continue;

    const groupPropMatch = line.match(/^      ([a-z_]+):(?:\s+(.+))?$/);
    if (groupPropMatch) {
      const key = groupPropMatch[1];
      const value = groupPropMatch[2];
      groupKey = key;
      if (value === undefined) {
        entity[group][key] = [];
      } else {
        entity[group][key] = coerceScalar(value);
      }
      continue;
    }

    const listAtGroupMatch = line.match(/^      -\s+(.+)$/);
    if (listAtGroupMatch) {
      if (!Array.isArray(entity[group])) entity[group] = [];
      entity[group].push(coerceScalar(listAtGroupMatch[1]));
      continue;
    }

    const listAtKeyMatch = line.match(/^        -\s+(.+)$/);
    if (listAtKeyMatch && groupKey) {
      if (!Array.isArray(entity[group][groupKey])) entity[group][groupKey] = [];
      entity[group][groupKey].push(coerceScalar(listAtKeyMatch[1]));
    }
  }

  return registry;
}

function coerceScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '[]') return [];
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  return trimmed.replace(/^['"]|['"]$/g, '');
}

export function flattenCodePatterns(feature) {
  const code = feature.code ?? {};
  const patterns = [];
  for (const value of Object.values(code)) {
    if (Array.isArray(value)) patterns.push(...value);
    else if (typeof value === 'string') patterns.push(value);
  }
  return patterns;
}

export function flattenDocs(feature) {
  const docs = feature.docs ?? {};
  const paths = [];
  for (const value of Object.values(docs)) {
    if (Array.isArray(value)) paths.push(...value);
    else if (typeof value === 'string') paths.push(value);
  }
  const required = feature.review?.required_docs ?? [];
  if (Array.isArray(required)) paths.push(...required);
  return [...new Set(paths)];
}

export function mapFilesToFeatures(registry, files) {
  const features = [];
  for (const [id, feature] of Object.entries(registry.features ?? {})) {
    const patterns = flattenCodePatterns(feature);
    const matchedFiles = files.filter((file) =>
      patterns.some((pattern) => matchGlob(pattern, file)),
    );
    if (matchedFiles.length > 0) {
      features.push({
        id,
        name: feature.name ?? id,
        criticality: feature.criticality ?? 'medium',
        matchedFiles,
        docs: flattenDocs(feature),
        requiredChecks: feature.review?.required_checks ?? [],
      });
    }
  }
  return features;
}

export function matchGlob(pattern, file) {
  const normalizedPattern = normalizePath(pattern);
  const normalizedFile = normalizePath(file);
  const regex = new RegExp(`^${globToRegex(normalizedPattern)}$`);
  return regex.test(normalizedFile);
}

function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        out += '.*';
        i += 1;
      } else {
        out += '[^/]*';
      }
    } else if (char === '?') {
      out += '.';
    } else {
      out += escapeRegex(char);
    }
  }
  return out;
}

function escapeRegex(char) {
  return /[\\^$+?.()|[\]{}]/.test(char) ? `\\${char}` : char;
}

export function fileExists(repoRoot, path) {
  return existsSync(join(repoRoot, path));
}
