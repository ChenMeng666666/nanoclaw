import type {
  Channel,
  NewMessage,
  RegisteredGroup,
} from '../types/core-runtime.js';
import type { AppState } from '../contexts/messaging/application/state-recovery-service.js';

/**
 * Interface for system-level skills that can be triggered by messages.
 * These skills run within the main process, outside the agent container.
 */
export interface SystemSkill {
  /**
   * Unique name of the skill (e.g., "remote-control")
   */
  name: string;

  /**
   * Description of what the skill does
   */
  description: string;

  /**
   * Check if this skill should handle the given message
   * @param message The incoming message
   * @param group The registered group context (if any)
   */
  shouldHandle(message: NewMessage, group?: RegisteredGroup): boolean;

  /**
   * Execute the skill logic
   * @param message The incoming message
   * @param channel The channel to send responses to
   * @param context Additional context including app state
   */
  execute(
    message: NewMessage,
    channel: Channel,
    context: SystemSkillContext,
  ): Promise<void>;
}

export interface SystemSkillContext {
  state: AppState;
  registeredGroups: Record<string, RegisteredGroup>;
  channels: Channel[];
}
