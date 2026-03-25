/**
 * Agent Configuration Management
 *
 * This module provides configuration management for agent instances.
 * Following the project's core principles:
 * - Minimalist infrastructure with no heavy dependencies
 * - Text-first approach using in-memory structures with persistence
 * - Strict isolation of data and state
 */

import type { AgentConfig as CustomAgentConfig } from './types.js';

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
const configStore: Map<string, CustomAgentConfig> = new Map();

/**
 * Validate agent configuration
 */
export function validateAgentConfig(
  config: Partial<CustomAgentConfig>,
): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.model_config?.model) {
    errors.push('model_config.model');
  }

  if (!config.model_config?.base_url) {
    errors.push('model_config.base_url');
  }

  if (!['proxy', 'direct'].includes(config.model_config?.auth_mode || '')) {
    errors.push('model_config.auth_mode');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get agent configuration by ID
 */
export function getAgentConfig(agentId: string): CustomAgentConfig | undefined {
  return configStore.get(agentId);
}

/**
 * Set agent configuration
 */
export function setAgentConfig(agentId: string, config: CustomAgentConfig): boolean {
  const validation = validateAgentConfig(config);
  if (!validation.valid) {
    return false;
  }
  configStore.set(agentId, config);
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
