import { isCommandAllowed } from '../../../config.js';

export class CommandSafetyService {
  validateCommandSafety(command: string): boolean {
    return isCommandAllowed(command);
  }

  assertCommandsSafe(commands: string[]): void {
    for (const command of commands) {
      if (!this.validateCommandSafety(command)) {
        throw new Error(`Command not allowed: ${command}`);
      }
    }
  }
}
