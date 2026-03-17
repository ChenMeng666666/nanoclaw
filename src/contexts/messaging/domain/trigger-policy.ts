export interface TriggerCandidate {
  content: string;
  sender: string;
  isFromMe: boolean;
}

export type TriggerSenderGuard = (sender: string) => boolean;

export class TriggerPolicy {
  shouldRequireTrigger(
    isMainGroup: boolean,
    requiresTrigger?: boolean,
  ): boolean {
    if (isMainGroup) {
      return false;
    }
    return requiresTrigger !== false;
  }

  hasEligibleTrigger(
    messages: TriggerCandidate[],
    triggerPattern: RegExp,
    isSenderAllowed: TriggerSenderGuard,
  ): boolean {
    return messages.some((message) => {
      const hasPattern = triggerPattern.test(message.content.trim());
      const senderAllowed = message.isFromMe || isSenderAllowed(message.sender);
      return hasPattern && senderAllowed;
    });
  }
}

export const triggerPolicy = new TriggerPolicy();
