/**
 * Agent Configuration Management
 *
 * This module provides configuration management for agent instances.
 * Following the project's core principles:
 * - Minimalist infrastructure with no heavy dependencies
 * - Text-first approach using in-memory structures with persistence
 * - Strict isolation of data and state
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface AgentConfig {
  /**
   * Unique name/identifier for the agent
   */
  name: string;

  /**
   * Model to use for the agent
   */
  model: string;

  /**
   * Temperature for generation (0-1)
   * @default 0.7
   */
  temperature?: number;

  /**
   * Maximum tokens per response
   * @default 4000
   */
  maxTokens?: number;

  /**
   * Request timeout in milliseconds
   * @default 60000 (1 minute)
   */
  timeout?: number;

  /**
   * Size of short-term memory buffer
   * @default 100
   */
  memorySize?: number;

  /**
   * Enable reflection mechanism
   * @default true
   */
  reflectionEnabled?: boolean;

  /**
   * Auto-save memory and state
   * @default true
   */
  autoSave?: boolean;

  /**
   * Logging level
   * @default 'info'
   */
  logLevel?: LogLevel;

  /**
   * Additional custom configuration
   */
  custom?: Record<string, any>;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<AgentConfig> = {
  temperature: 0.7,
  maxTokens: 4000,
  timeout: 60000,
  memorySize: 100,
  reflectionEnabled: true,
  autoSave: true,
  logLevel: 'info'
};

/**
 * Validation result
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * In-memory storage for agent configurations
 */
const configStore: Map<string, AgentConfig> = new Map();

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: Partial<AgentConfig>): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.name || typeof config.name !== 'string' || config.name.trim().length === 0) {
    errors.push('name');
  }

  if (!config.model || typeof config.model !== 'string' || config.model.trim().length === 0) {
    errors.push('model');
  }

  if (config.temperature !== undefined) {
    if (typeof config.temperature !== 'number' || config.temperature < 0 || config.temperature > 1) {
      errors.push('temperature');
    }
  }

  if (config.maxTokens !== undefined) {
    if (typeof config.maxTokens !== 'number' || config.maxTokens <= 0 || !Number.isInteger(config.maxTokens)) {
      errors.push('maxTokens');
    }
  }

  if (config.timeout !== undefined) {
    if (typeof config.timeout !== 'number' || config.timeout <= 0) {
      errors.push('timeout');
    }
  }

  if (config.memorySize !== undefined) {
    if (typeof config.memorySize !== 'number' || config.memorySize <= 0 || !Number.isInteger(config.memorySize)) {
      errors.push('memorySize');
    }
  }

  if (config.logLevel !== undefined) {
    const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(config.logLevel as LogLevel)) {
      errors.push('logLevel');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Agent Configuration Class
 *
 * Provides a type-safe interface for managing agent configuration
 * with validation and default values.
 */
export class AgentConfig {
  private config: Required<AgentConfig>;

  constructor(config: AgentConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      custom: config.custom || {}
    } as Required<AgentConfig>;
  }

  /**
   * Get a config value
   */
  get<K extends keyof AgentConfig>(key: K): AgentConfig[K] {
    return this.config[key];
  }

  /**
   * Set a config value
   */
  set<K extends keyof AgentConfig>(key: K, value: AgentConfig[K]): boolean {
    const tempConfig = { ...this.config, [key]: value };
    const validation = validateAgentConfig(tempConfig);

    if (!validation.valid) {
      return false;
    }

    this.config = tempConfig;
    return true;
  }

  /**
   * Set multiple config values at once
   */
  setAll(updates: Partial<AgentConfig>): boolean {
    const tempConfig = { ...this.config, ...updates };
    const validation = validateAgentConfig(tempConfig);

    if (!validation.valid) {
      return false;
    }

    this.config = tempConfig;
    return true;
  }

  /**
   * Get all config values
   */
  getAll(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Validate the current configuration
   */
  validate(): ConfigValidationResult {
    return validateAgentConfig(this.config);
  }

  /**
   * Convert to plain object
   */
  toJSON(): AgentConfig {
    return this.getAll();
  }
}

/**
 * Get agent configuration by ID
 */
export function getAgentConfig(agentId: string): AgentConfig | undefined {
  const stored = configStore.get(agentId);
  if (stored) {
    return new AgentConfig(stored).getAll();
  }
  return undefined;
}

/**
 * Set agent configuration
 */
export function setAgentConfig(agentId: string, config: AgentConfig): boolean {
  const validation = validateAgentConfig(config);
  if (!validation.valid) {
    return false;
  }

  const agentConfig = new AgentConfig(config);
  configStore.set(agentId, agentConfig.getAll());
  return true;
}

/**
 * Delete agent configuration
 */
export function deleteAgentConfig(agentId: string): boolean {
  return configStore.delete(agentId);
}

/**
 * Check if agent configuration exists
 */
export function hasAgentConfig(agentId: string): boolean {
  return configStore.has(agentId);
}

/**
 * Get all agent IDs with configuration
 */
export function getAllAgentIds(): string[] {
  return Array.from(configStore.keys());
}

/**
 * Clear all configurations (for testing/reset purposes)
 */
export function clearAllConfigs(): void {
  configStore.clear();
}
