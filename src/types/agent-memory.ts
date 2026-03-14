export interface AgentConfig {
  id: string;
  name: string;
  folder: string;
  userName?: string;
  personality?: string;
  values?: string;
  appearance?: string;
  isActive: boolean;
  credentials: {
    anthropicToken?: string;
    anthropicUrl?: string;
    anthropicModel: string;
  };
}

export interface ChannelInstance {
  id: string;
  agentId: string;
  channelType: string;
  botId: string;
  jid: string;
  name?: string;
  config?: Record<string, any>;
  mode: 'dm' | 'group' | 'both';
  isActive: boolean;
}

export interface UserProfile {
  id: string;
  channelInstanceId: string;
  userJid: string;
  name?: string;
  preferences?: Record<string, any>;
  memorySummary?: string;
  lastInteraction: string;
  createdAt: string;
}

export interface Memory {
  id: string;
  agentFolder: string;
  userJid?: string;
  sessionId?: string;
  scope?: 'session' | 'user' | 'agent' | 'global';
  level: 'L1' | 'L2' | 'L3';
  content: string;
  embedding?: number[];
  importance: number;
  qualityScore?: number;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
  messageType?: 'user' | 'system' | 'bot' | 'code' | 'document';
  timestampWeight?: number;
  tags?: string[];
  sourceType?: 'direct' | 'extracted' | 'summary';
}

export interface Reflection {
  id: number;
  agentFolder: string;
  type: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'task';
  content: string;
  triggeredBy?: string;
  createdAt: string;
}

export interface LearningNeed {
  topic: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  urgency: 'high' | 'medium' | 'low';
  estimatedTime: number;
  resources?: string[];
}

export interface DailyLearningPlan {
  id: string;
  date: string;
  agentFolder: string;
  tasks: LearningTask[];
  estimatedTime: number;
  priority: 'high' | 'medium' | 'low';
}

export interface LearningTask {
  id: string;
  agentFolder: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  reflectionId?: number;
  resources?: string[];
  createdAt: string;
  completedAt?: string;
}

export interface LearningSchedulePreference {
  mode: 'fixed_time' | 'interval' | 'cron';
  fixedTime?: string;
  intervalMinutes?: number;
  cron?: string;
  timezone?: string;
}

export interface LearningModelDecision {
  stage: 'analyze-needs' | 'reflection-generate';
  primary: 'sdk' | 'local' | 'rules';
  selected: 'sdk' | 'local' | 'rules';
  degraded: boolean;
  degradeReason?: string;
}

export interface LearningIntentOrchestrationResult {
  topic: string;
  reflectionPlan: {
    reused: boolean;
    taskId: string;
    scheduleType: 'cron' | 'interval' | 'once';
    scheduleValue: string;
  };
  learningTaskId: string;
  scheduleTaskId: string;
  scheduleType: 'cron' | 'interval' | 'once';
  scheduleValue: string;
  nextRun: string;
  modelDecisions: LearningModelDecision[];
}

export interface DetailedReflection extends Reflection {
  taskId?: string;
  completionTime?: string;
  actualDuration?: number;
  knowledgeGained?: string[];
  difficulties?: string[];
  solutions?: string[];
  suggestions?: string[];
  keyInsights?: string[];
  nextSteps?: string[];
  rating?: 1 | 2 | 3 | 4 | 5;
}
