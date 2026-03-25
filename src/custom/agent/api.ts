/**
 * Agent API Interface
 *
 * This module provides high-level API for agent operations.
 * Following the project's core principles:
 * - Minimalist infrastructure
 * - Strict isolation of data and state
 * - API layer on top of custom module
 */

import type {
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  DeleteAgentInput,
  RunAgentInput,
  BindAgentToGroupInput,
  Agent,
} from './types.js';
import {
  createAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  getAgentById,
  getPrimaryAgentForGroup,
  getGroupAgents,
  bindAgentToGroup,
  unbindAgentFromGroup,
  getAgentGroups,
} from './db.js';
import { validateAgentConfig } from './config.js';

/**
 * Agent API - High-level operations
 */
export class AgentAPI {
  /**
   * Create a new agent
   */
  static create(input: CreateAgentInput): Agent {
    // Validate config if provided
    if (input.config) {
      const validation = validateAgentConfig(input.config);
      if (!validation.valid) {
        throw new Error(`Invalid agent config: ${validation.errors.join(', ')}`);
      }
    }

    return createAgent(input);
  }

  /**
   * List agents with optional filters
   */
  static list(input?: ListAgentsInput): Agent[] {
    return listAgents(input);
  }

  /**
   * Get agent by ID
   */
  static getById(id: string): Agent | undefined {
    return getAgentById(id);
  }

  /**
   * Update an existing agent
   */
  static update(input: UpdateAgentInput): Agent | undefined {
    if (input.updates.config) {
      const validation = validateAgentConfig(input.updates.config);
      if (!validation.valid) {
        throw new Error(`Invalid agent config: ${validation.errors.join(', ')}`);
      }
    }

    return updateAgent(input);
  }

  /**
   * Delete an agent
   */
  static delete(input: DeleteAgentInput): boolean {
    return deleteAgent(input);
  }

  /**
   * Bind agent to a group
   */
  static bindToGroup(input: BindAgentToGroupInput) {
    return bindAgentToGroup(input);
  }

  /**
   * Unbind agent from a group
   */
  static unbindFromGroup(agentId: string, groupFolder: string): boolean {
    return unbindAgentFromGroup(agentId, groupFolder);
  }

  /**
   * Get primary agent for a group
   */
  static getPrimaryForGroup(groupFolder: string): Agent | undefined {
    return getPrimaryAgentForGroup(groupFolder);
  }

  /**
   * Get all agents associated with a group
   */
  static getGroupAgents(groupFolder: string): Agent[] {
    return getGroupAgents(groupFolder);
  }

  /**
   * Get all groups associated with an agent
   */
  static getAgentGroups(agentId: string): string[] {
    return getAgentGroups(agentId);
  }

  /**
   * Check if agent is associated with a group
   */
  static isAgentInGroup(agentId: string, groupFolder: string): boolean {
    const groups = getAgentGroups(agentId);
    return groups.includes(groupFolder);
  }

  /**
   * Get agent's primary status in a group
   */
  static isPrimaryAgent(agentId: string, groupFolder: string): boolean {
    const primaryAgent = getPrimaryAgentForGroup(groupFolder);
    return primaryAgent?.id === agentId;
  }
}

// Re-export core functions for direct usage
export {
  createAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  getAgentById,
  getPrimaryAgentForGroup,
  getGroupAgents,
  bindAgentToGroup,
  unbindAgentFromGroup,
  getAgentGroups,
};
