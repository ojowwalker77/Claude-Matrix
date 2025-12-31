import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';

// Config file location (outside repo, won't be overwritten on updates)
const CONFIG_PATH = join(homedir(), '.claude', 'matrix.config');

export interface MatrixConfig {
  search: {
    defaultLimit: number;
    defaultMinScore: number;
    defaultScope: 'all' | 'repo' | 'stack' | 'global';
  };
  merge: {
    defaultThreshold: number;
  };
  list: {
    defaultLimit: number;
  };
  export: {
    defaultDirectory: string;
    defaultFormat: 'json' | 'csv';
  };
  display: {
    colors: boolean;
    boxWidth: number;
    cardWidth: number;
    truncateLength: number;
  };
  scoring: {
    highThreshold: number;
    midThreshold: number;
  };
  hooks: {
    enabled: boolean;
    complexityThreshold: number;
    enableApiCache: boolean;
    cacheTtlHours: number;
    auditorTimeout: number;
    skipDeprecationWarnings: boolean;
    sizeWarningThreshold: number;
  };
  indexing: {
    enabled: boolean;
    excludePatterns: string[];
    maxFileSize: number;
    timeout: number;
    includeTests: boolean;
  };
  toolSearch: {
    enabled: boolean;
    preferMatrixIndex: boolean;
    preferContext7: boolean;
  };
}

function getDownloadsDirectory(): string {
  return join(homedir(), 'Downloads');
}

export const DEFAULT_CONFIG: MatrixConfig = {
  search: {
    defaultLimit: 5,
    defaultMinScore: 0.3,
    defaultScope: 'all',
  },
  merge: {
    defaultThreshold: 0.8,
  },
  list: {
    defaultLimit: 20,
  },
  export: {
    defaultDirectory: getDownloadsDirectory(),
    defaultFormat: 'json',
  },
  display: {
    colors: true,
    boxWidth: 55,
    cardWidth: 70,
    truncateLength: 40,
  },
  scoring: {
    highThreshold: 0.7,
    midThreshold: 0.4,
  },
  hooks: {
    enabled: true,
    complexityThreshold: 5,
    enableApiCache: false,
    cacheTtlHours: 24,
    auditorTimeout: 30,
    skipDeprecationWarnings: false,
    sizeWarningThreshold: 500000,
  },
  indexing: {
    enabled: true,
    excludePatterns: [],
    maxFileSize: 1024 * 1024, // 1MB
    timeout: 60,
    includeTests: false,
  },
  toolSearch: {
    enabled: true,
    preferMatrixIndex: true,
    preferContext7: true,
  },
};

let cachedConfig: MatrixConfig | null = null;

function deepMerge(target: MatrixConfig, source: Partial<MatrixConfig>): MatrixConfig {
  const result = JSON.parse(JSON.stringify(target)) as MatrixConfig;

  if (source.search) {
    result.search = { ...result.search, ...source.search };
  }
  if (source.merge) {
    result.merge = { ...result.merge, ...source.merge };
  }
  if (source.list) {
    result.list = { ...result.list, ...source.list };
  }
  if (source.export) {
    result.export = { ...result.export, ...source.export };
  }
  if (source.display) {
    result.display = { ...result.display, ...source.display };
  }
  if (source.scoring) {
    result.scoring = { ...result.scoring, ...source.scoring };
  }
  if (source.hooks) {
    result.hooks = { ...result.hooks, ...source.hooks };
  }
  if (source.indexing) {
    result.indexing = { ...result.indexing, ...source.indexing };
  }
  if (source.toolSearch) {
    result.toolSearch = { ...result.toolSearch, ...source.toolSearch };
  }

  return result;
}

export function getConfig(): MatrixConfig {
  if (cachedConfig) return cachedConfig;
  let userConfig: Partial<MatrixConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    try {
      const content = readFileSync(CONFIG_PATH, 'utf-8');
      userConfig = JSON.parse(content);
    } catch {
      // Invalid config, use defaults
    }
  }
  cachedConfig = deepMerge(DEFAULT_CONFIG, userConfig);
  return cachedConfig;
}

export function saveConfig(config: MatrixConfig): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  cachedConfig = config;
}

export function resetConfig(): void {
  saveConfig({ ...DEFAULT_CONFIG });
}

export function get<T>(key: string): T {
  const config = getConfig();
  const parts = key.split('.');
  let value: unknown = config as unknown;
  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      throw new Error(`Config key not found: ${key}`);
    }
  }
  return value as T;
}

export function set(key: string, value: unknown): void {
  const config = getConfig();
  const parts = key.split('.');
  const lastPart = parts.pop()!;
  let target: Record<string, unknown> = config as unknown as Record<string, unknown>;
  for (const part of parts) {
    if (target[part] && typeof target[part] === 'object') {
      target = target[part] as Record<string, unknown>;
    } else {
      throw new Error(`Config key not found: ${key}`);
    }
  }
  const existingValue = target[lastPart];
  if (typeof existingValue === 'number') {
    const numValue = Number(value);
    if (isNaN(numValue)) {
      throw new Error(`Invalid number value for ${key}: ${value}`);
    }
    target[lastPart] = numValue;
  } else if (typeof existingValue === 'boolean') {
    target[lastPart] = value === 'true' || value === true;
  } else {
    target[lastPart] = value;
  }
  saveConfig(config);
}

export function getAllKeys(): Array<{ key: string; value: unknown; type: string }> {
  const result: Array<{ key: string; value: unknown; type: string }> = [];
  function traverse(obj: Record<string, unknown>, prefix: string): void {
    for (const key in obj) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      const value = obj[key];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        traverse(value as Record<string, unknown>, fullKey);
      } else {
        result.push({ key: fullKey, value, type: typeof value });
      }
    }
  }
  const config = getConfig();
  traverse(config as unknown as Record<string, unknown>, '');
  return result;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function clearCache(): void {
  cachedConfig = null;
}
