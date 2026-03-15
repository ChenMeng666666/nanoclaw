export interface AgentMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: 'message' | 'task' | 'notification' | 'status';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
}

export interface BotIdentity {
  id: string;
  chatJid: string;
  agentId: string;
  botName: string;
  botAvatar?: string;
  isActive: boolean;
  config?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CollaborationTask {
  id: string;
  title: string;
  description?: string;
  teamId?: string;
  assignedAgents: string[];
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  progress: number;
  dependencies?: string[];
  context?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CollaborationTaskAssignment {
  id: string;
  taskId: string;
  agentId: string;
  role: string;
  status: 'accepted' | 'rejected' | 'in_progress' | 'completed';
  assignedAt: string;
  completedAt?: string;
}

export interface TeamState {
  id: string;
  name: string;
  description?: string;
  members: string[];
  leaderId?: string;
  status: 'active' | 'inactive' | 'dissolved';
  collaborationMode: 'hierarchical' | 'peer-to-peer' | 'swarm';
  createdAt: string;
  updatedAt: string;
}

export interface TeamCollaborationState {
  id: string;
  teamId: string;
  taskId?: string;
  status: 'planning' | 'executing' | 'reviewing' | 'completed';
  progress: number;
  activeAgents: string[];
  lastActivity: string;
  createdAt: string;
  updatedAt: string;
}
