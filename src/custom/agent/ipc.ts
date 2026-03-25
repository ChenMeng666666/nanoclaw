/**
 * Agent IPC Interface
 *
 * This module provides IPC message handling for agent operations.
 * Following the project's core principles:
 * - Non-intrusive extension via custom module
 * - Minimalist infrastructure
 * - Strict isolation of data and state
 */

import { logger } from '../../logger.js';
import type {
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  DeleteAgentInput,
  RunAgentInput,
  BindAgentToGroupInput,
  Agent,
} from './types.js';

// Re-export types for IPC usage
export type {
  CreateAgentInput,
  ListAgentsInput,
  UpdateAgentInput,
  DeleteAgentInput,
  RunAgentInput,
  BindAgentToGroupInput,
};

/**
 * Agent IPC message types
 */
export type AgentIpcMessage =
  | { type: 'create_agent'; payload: CreateAgentInput }
  | { type: 'list_agents'; payload?: ListAgentsInput }
  | { type: 'update_agent'; payload: UpdateAgentInput }
  | { type: 'delete_agent'; payload: DeleteAgentInput }
  | { type: 'run_agent'; payload: RunAgentInput }
  | { type: 'bind_agent_to_group'; payload: BindAgentToGroupInput }
  | { type: 'get_agent'; payload: { agentId: string } }
  | { type: 'get_primary_agent'; payload: { groupFolder: string } }
  | { type: 'get_group_agents'; payload: { groupFolder: string } };

/**
 * Agent IPC response types
 */
export type AgentIpcResponse =
  | { success: true; data: Agent | Agent[] | string | boolean | null }
  | { success: false; error: string };

/**
 * Type guard for agent IPC messages
 */
export function isAgentIpcMessage(message: { type: string }): boolean {
  const agentTypes = [
    'create_agent',
    'list_agents',
    'update_agent',
    'delete_agent',
    'run_agent',
    'bind_agent_to_group',
    'get_agent',
    'get_primary_agent',
    'get_group_agents',
  ];
  return agentTypes.includes(message.type);
}

/**
 * Validate agent IPC message payload
 */
export function validateAgentIpcMessage(
  message: AgentIpcMessage,
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (message.type) {
    case 'create_agent':
      if (!message.payload.name) errors.push('payload.name is required');
      if (!message.payload.role) errors.push('payload.role is required');
      break;

    case 'update_agent':
      if (!message.payload.agentId) errors.push('payload.agentId is required');
      break;

    case 'delete_agent':
      if (!message.payload.agentId) errors.push('payload.agentId is required');
      break;

    case 'run_agent':
      if (!message.payload.agentId) errors.push('payload.agentId is required');
      if (!message.payload.prompt) errors.push('payload.prompt is required');
      break;

    case 'bind_agent_to_group':
      if (!message.payload.agentId) errors.push('payload.agentId is required');
      if (!message.payload.groupFolder) errors.push('payload.groupFolder is required');
      break;

    case 'get_agent':
      if (!message.payload.agentId) errors.push('payload.agentId is required');
      break;

    case 'get_primary_agent':
      if (!message.payload.groupFolder) errors.push('payload.groupFolder is required');
      break;

    case 'get_group_agents':
      if (!message.payload.groupFolder) errors.push('payload.groupFolder is required');
      break;

    case 'list_agents':
      // List has no required fields
      break;

    default:
      errors.push(`Unknown agent IPC type: ${(message as any).type}`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Process agent IPC message
 * This is a handler function that can be integrated into the main IPC processor
 */
export async function processAgentIpcMessage(
  message: AgentIpcMessage,
  handlers: {
    createAgent: (input: CreateAgentInput) => Agent | Promise<Agent>;
    listAgents: (input?: ListAgentsInput) => Agent[] | Promise<Agent[]>;
    updateAgent: (input: UpdateAgentInput) => Agent | undefined | Promise<Agent | undefined>;
    deleteAgent: (input: DeleteAgentInput) => boolean | Promise<boolean>;
    getAgent: (agentId: string) => Agent | undefined | Promise<Agent | undefined>;
    getPrimaryAgentForGroup: (groupFolder: string) => Agent | undefined | Promise<Agent | undefined>;
    getGroupAgents: (groupFolder: string) => Agent[] | Promise<Agent[]>;
    bindAgentToGroup: (input: BindAgentToGroupInput) => any | Promise<any>;
    runAgent?: (input: RunAgentInput) => any | Promise<any>;
  },
): Promise<AgentIpcResponse> {
  try {
    const validation = validateAgentIpcMessage(message);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid IPC message: ${validation.errors.join(', ')}`,
      };
    }

    logger.debug({ type: message.type }, 'Processing agent IPC message');

    switch (message.type) {
      case 'create_agent': {
        const agent = await handlers.createAgent(message.payload);
        return { success: true, data: agent };
      }

      case 'list_agents': {
        const agents = await handlers.listAgents(message.payload);
        return { success: true, data: agents };
      }

      case 'update_agent': {
        const agent = await handlers.updateAgent(message.payload);
        return { success: true, data: agent || null };
      }

      case 'delete_agent': {
        const result = await handlers.deleteAgent(message.payload);
        return { success: true, data: result };
      }

      case 'get_agent': {
        const agent = await handlers.getAgent(message.payload.agentId);
        return { success: true, data: agent || null };
      }

      case 'get_primary_agent': {
        const agent = await handlers.getPrimaryAgentForGroup(message.payload.groupFolder);
        return { success: true, data: agent || null };
      }

      case 'get_group_agents': {
        const agents = await handlers.getGroupAgents(message.payload.groupFolder);
        return { success: true, data: agents };
      }

      case 'bind_agent_to_group': {
        const result = await handlers.bindAgentToGroup(message.payload);
        return { success: true, data: result };
      }

      case 'run_agent': {
        if (handlers.runAgent) {
          const result = await handlers.runAgent(message.payload);
          return { success: true, data: result };
        }
        return { success: false, error: 'run_agent handler not implemented' };
      }

      default:
        return {
          success: false,
          error: `Unsupported agent IPC type: ${(message as any).type}`,
        };
    }
  } catch (err) {
    logger.error({ err, type: message.type }, 'Error processing agent IPC message');
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}
