import type { EvolutionCategory, GDIScore, EvolutionStrategy } from './gep.js';
export type { GDIScore, EvolutionCategory, EvolutionStrategy } from './gep.js';
export type {
  StrategyConfig,
  DuplicateCheckResult,
  EcosystemMetrics,
} from './gep.js';
export { STRATEGY_CONFIGS } from './gep.js';

export interface DailyLearningSummary {
  id: string;
  date: string;
  agentFolder: string;
  tasksCompleted: number;
  totalTimeSpent: number;
  knowledgePoints: string[];
  achievements: string[];
  challenges: string[];
  improvements: string[];
  tomorrowPlan: string[];
  mood: 'great' | 'good' | 'average' | 'bad';
  notes?: string;
}

export interface LearningAutomationConfig {
  enabled: boolean;
  dailyPlanTime: string;
  dailySummaryTime: string;
  reflections: {
    hourly: boolean;
    daily: boolean;
    weekly: boolean;
    monthly: boolean;
    yearly: boolean;
  };
}

export interface Gene {
  type: 'Gene';
  id: number;
  category: EvolutionCategory;
  signalsMatch: string[];
  strategy: string[];
  constraints: {
    maxFiles?: number;
    forbiddenPaths?: string[];
    applicableScenarios?: string[];
  };
  validation: string[];
  abilityName: string;
  description?: string;
  sourceAgentId: string;
  content: string;
  contentEmbedding?: number[];
  tags: string[];
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  feedback: Array<{
    agentId: string;
    comment: string;
    rating: number;
    usedAt?: string;
  }>;
  createdAt: string;
}

export enum MainComponent {
  CHANNELS = 'channels',
  CONTAINER = 'container',
  ROUTER = 'router',
  DATABASE = 'database',
  QUEUE = 'queue',
}

export interface MainExperienceInput {
  abilityName: string;
  content: string;
  description?: string;
  tags?: string[];
  category?: EvolutionCategory;
  component?: MainComponent;
}

export interface MainEvolutionConfig {
  enabled: boolean;
  autoApply: boolean;
  componentWhitelist: MainComponent[];
  signalThreshold: number;
}

export type EvolutionEntry = Omit<
  Gene,
  | 'type'
  | 'category'
  | 'signalsMatch'
  | 'strategy'
  | 'constraints'
  | 'validation'
> & {
  category?: EvolutionCategory;
  signalsMatch?: string[];
  strategy?: string[];
  constraints?: Gene['constraints'];
  validation?: string[];
  schema_version?: string;
  asset_id?: string;
  gdi_score?: GDIScore;
  gdiScore?: GDIScore;
  chain_id?: string;
  summary?: string;
  preconditions?: string[];
  validation_commands?: string[];
  ecosystem_status?: 'promoted' | 'stale' | 'archived';
};

export interface ReviewConfig {
  autoApproveThreshold: number;
  requireUserReview: boolean;
  seniorAgentIds?: string[];
  strategy: EvolutionStrategy;
}

export interface EvolutionDashboardSnapshot {
  timestamp: string;
  shannonDiversity: number;
  avgGDIScore: number;
  totalGenes: number;
  totalCapsules: number;
  promotedGenes: number;
  staleGenes: number;
  archivedGenes: number;
}

export interface EvolutionDashboardMetrics {
  generatedAt: string;
  summary: {
    shannonDiversity: number;
    avgGDIScore: number;
    totalGenes: number;
    totalCapsules: number;
    promotedGenes: number;
    staleGenes: number;
    archivedGenes: number;
    promotionRate: number;
  };
  timeline: EvolutionDashboardSnapshot[];
}
