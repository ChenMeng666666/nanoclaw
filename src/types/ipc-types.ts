import type { RegisteredGroup } from './core-runtime.js';

export interface IPCMessage {
  type: 'message';
  chatJid: string;
  text: string;
}

export interface IPCRequest {
  type: string;
  taskId?: string;
  prompt?: string;
  schedule_type?: string;
  schedule_value?: string;
  context_mode?: string;
  groupFolder?: string;
  chatJid?: string;
  targetJid?: string;
  // For register_group
  jid?: string;
  name?: string;
  folder?: string;
  trigger?: string;
  requiresTrigger?: boolean;
  containerConfig?: RegisteredGroup['containerConfig'];
}

export interface IPCResponse {
  status: 'success' | 'error';
  result?: unknown;
  error?: string;
}
