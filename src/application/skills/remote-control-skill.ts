import type {
  Channel,
  NewMessage,
  RegisteredGroup,
} from '../../types/core-runtime.js';
import { logger } from '../../logger.js';
import { startRemoteControl, stopRemoteControl } from '../remote-control.js';
import type { SystemSkill, SystemSkillContext } from '../system-skill.js';

export class RemoteControlSystemSkill implements SystemSkill {
  public name = 'remote-control';
  public description =
    'Control the host machine via chat commands (Main Group only)';

  public shouldHandle(message: NewMessage, group?: RegisteredGroup): boolean {
    const content = message.content.trim();
    return content.startsWith('/remote-control');
  }

  public async execute(
    message: NewMessage,
    channel: Channel,
    context: SystemSkillContext,
  ): Promise<void> {
    const { chat_jid: chatJid, sender, content } = message;
    const group = context.registeredGroups[chatJid];

    // Security Check: Only allow Main Group
    if (!group?.isMain) {
      logger.warn(
        { chatJid, sender },
        'Unauthorized /remote-control attempt (not main group)',
      );
      return;
    }

    const args = content.trim().split(/\s+/);
    const subcommand = args[1];

    if (subcommand === 'stop') {
      const result = stopRemoteControl();
      if (result.ok) {
        await channel.sendMessage(chatJid, 'Remote Control session stopped.');
      } else {
        await channel.sendMessage(chatJid, `Failed to stop: ${result.error}`);
      }
    } else {
      // Async execution to avoid blocking message loop
      // We use setImmediate/Promise to ensure the main loop continues
      this.executeStart(chatJid, sender, channel).catch((err) => {
        logger.error({ err }, 'Remote control execution failed');
      });
    }
  }

  private async executeStart(
    chatJid: string,
    sender: string,
    channel: Channel,
  ): Promise<void> {
    await channel.sendMessage(chatJid, 'Starting Remote Control session...');
    const result = await startRemoteControl(sender, chatJid, process.cwd());
    if (result.ok) {
      await channel.sendMessage(
        chatJid,
        `Remote Control active: ${result.url}`,
      );
    } else {
      await channel.sendMessage(chatJid, `Failed to start: ${result.error}`);
    }
  }
}
